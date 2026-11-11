import { describe, it, expect } from 'vitest';
import {
  normalizeOrigin,
  decideCapture,
  addToNeverList,
  removeFromNeverList,
  isNeverListed,
  suggestionsFor,
  toListDto,
  filterCredentials,
  type CredView,
} from '../../../src/main/passwords/model';

const cred = (over: Partial<CredView>): CredView => ({
  id: 'c1',
  origin: 'https://example.com',
  username: 'alice',
  password: 'pw1',
  createdAt: 1,
  lastUsedAt: 2,
  ...over,
});

describe('normalizeOrigin', () => {
  it('lowercases, drops path and default ports', () => {
    expect(normalizeOrigin('HTTPS://Example.COM:443/login?x=1')).toBe('https://example.com');
    expect(normalizeOrigin('http://example.com:80/')).toBe('http://example.com');
    expect(normalizeOrigin('http://example.com:8080/a')).toBe('http://example.com:8080');
    expect(normalizeOrigin('https://user:pw@example.com/')).toBe('https://example.com');
  });

  it('returns null for non-http(s) or invalid input', () => {
    expect(normalizeOrigin('file:///C:/x.html')).toBeNull();
    expect(normalizeOrigin('neutrino://settings')).toBeNull();
    expect(normalizeOrigin('about:blank')).toBeNull();
    expect(normalizeOrigin('not a url')).toBeNull();
    expect(normalizeOrigin('')).toBeNull();
  });
});

describe('decideCapture', () => {
  const vault = [cred({})];
  const cap = { origin: 'https://example.com/login', username: 'alice', password: 'pw1' };

  it('touches on an exact match', () => {
    expect(decideCapture(vault, [], cap)).toBe('touch');
  });
  it('updates when the password differs', () => {
    expect(decideCapture(vault, [], { ...cap, password: 'other' })).toBe('update');
  });
  it('saves for a new username or different origin', () => {
    expect(decideCapture(vault, [], { ...cap, username: 'bob' })).toBe('save');
    expect(decideCapture(vault, [], { ...cap, origin: 'http://example.com' })).toBe('save');
  });
  it('suppresses never-listed and non-http(s) origins', () => {
    expect(decideCapture(vault, ['https://EXAMPLE.com:443'], cap)).toBe('suppress');
    expect(decideCapture(vault, [], { ...cap, origin: 'file:///x' })).toBe('suppress');
  });
  it('offers update for an unreadable credential with the same username', () => {
    const v = [cred({ password: undefined, unreadable: true })];
    expect(decideCapture(v, [], cap)).toBe('update');
  });
});

describe('never-list helpers', () => {
  it('adds normalized, deduplicates and removes', () => {
    let list = addToNeverList([], 'https://Example.com/login');
    expect(list).toEqual(['https://example.com']);
    list = addToNeverList(list, 'https://example.com:443');
    expect(list).toEqual(['https://example.com']);
    expect(isNeverListed(list, 'https://example.com/x')).toBe(true);
    const before = ['https://a.test'];
    removeFromNeverList(before, 'https://a.test');
    expect(before).toEqual(['https://a.test']); // input not mutated
    expect(removeFromNeverList(list, 'https://EXAMPLE.com')).toEqual([]);
  });

  it('round-trips the capture decision', () => {
    const cap = { origin: 'https://site.test', username: 'u', password: 'p' };
    const list = addToNeverList([], cap.origin);
    expect(decideCapture([], list, cap)).toBe('suppress');
    expect(decideCapture([], removeFromNeverList(list, cap.origin), cap)).toBe('save');
  });
});

describe('suggestionsFor', () => {
  const vault = [
    cred({ id: 'a', origin: 'https://example.com' }),
    cred({ id: 'b', origin: 'http://example.com' }),
    cred({ id: 'c', origin: 'https://example.com:8443' }),
    cred({ id: 'd', origin: 'https://example.com', unreadable: true, password: undefined }),
  ];

  it('matches scheme, host and port exactly', () => {
    expect(suggestionsFor(vault, 'https://EXAMPLE.com/login').map((c) => c.id)).toEqual(['a']);
    expect(suggestionsFor(vault, 'https://example.com:8443/').map((c) => c.id)).toEqual(['c']);
  });
  it('never offers an https credential to an http frame', () => {
    expect(suggestionsFor(vault, 'http://example.com/').map((c) => c.id)).toEqual(['b']);
  });
  it('returns nothing for non-http(s) frames', () => {
    expect(suggestionsFor(vault, 'about:blank')).toEqual([]);
  });
});

describe('toListDto and filterCredentials', () => {
  it('carries no plaintext', () => {
    const dto = toListDto([cred({ password: 's3cr3t-value' })]);
    expect(JSON.stringify(dto)).not.toContain('s3cr3t-value');
    expect(dto[0]).toEqual({
      id: 'c1',
      origin: 'https://example.com',
      username: 'alice',
      createdAt: 1,
      lastUsedAt: 2,
      unreadable: false,
    });
  });

  it('filters case-insensitively on origin or username', () => {
    const items = toListDto([
      cred({ id: '1', origin: 'https://github.com', username: 'Alice' }),
      cred({ id: '2', origin: 'https://mail.test', username: 'bob' }),
    ]);
    expect(filterCredentials(items, 'GIT').map((c) => c.id)).toEqual(['1']);
    expect(filterCredentials(items, 'ALI').map((c) => c.id)).toEqual(['1']);
    expect(filterCredentials(items, 'b').map((c) => c.id)).toEqual(['1', '2']);
    expect(filterCredentials(items, '')).toHaveLength(2);
    expect(filterCredentials(items, 'zzz')).toEqual([]);
  });
});
