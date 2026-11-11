import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  serializeCsv,
  parseCredentialCsv,
  serializeCredentialCsv,
  detectColumns,
  classifyImport,
} from '../../../src/main/passwords/csv';

describe('parseCsv / serializeCsv', () => {
  it('handles quotes, embedded commas and newlines, unicode, BOM and CRLF', () => {
    const text = '\uFEFFa,"b,c","say ""hi"""\r\n"multi\nline",ünï😀,\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['multi\nline', 'ünï😀', ''],
    ]);
  });

  it('skips blank lines and accepts a final record without newline', () => {
    expect(parseCsv('a,b\n\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('round-trips awkward records', () => {
    const records = [['x', ''], [''], ['"', ',', '\r\n', ' sp ']];
    expect(parseCsv(serializeCsv(records))).toEqual(records);
    expect(parseCsv(serializeCsv(records, { bom: true }))).toEqual(records);
  });
});

describe('credential CSV', () => {
  it('detects Chrome/Edge export columns', () => {
    const text =
      'name,url,username,password,note\r\nex,https://ex.com/login,bob,p,a,ss,\r\n';
    const r = parseCredentialCsv(text.replace('p,a,ss', '"p,a,ss"'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns).toEqual({ url: 1, username: 2, password: 3 });
    expect(r.rows).toEqual([{ url: 'https://ex.com/login', username: 'bob', password: 'p,a,ss' }]);
  });

  it('detects Bitwarden-style names case-insensitively', () => {
    expect(detectColumns(['Login_URI', ' Login_Username ', 'LOGIN_PASSWORD'])).toEqual({
      url: 0,
      username: 1,
      password: 2,
    });
  });

  it('reports missing columns and empty input', () => {
    expect(parseCredentialCsv('')).toEqual({ ok: false, error: 'empty' });
    expect(parseCredentialCsv('url,user_id\n')).toEqual({
      ok: false,
      error: 'missing-columns',
      missing: ['username', 'password'],
    });
  });

  it('round-trips credential rows', () => {
    const rows = [
      { url: 'https://a.com', username: 'ä"q', password: 'x,\ny' },
      { url: 'http://b.com:8080', username: 'u', password: ' ' },
    ];
    const r = parseCredentialCsv(serializeCredentialCsv(rows, { bom: true }));
    expect(r.ok && r.rows).toEqual(rows);
  });
});

describe('classifyImport', () => {
  it('buckets rows as imported, duplicate, conflict and invalid', () => {
    const existing = [{ origin: 'https://a.com', username: 'bob', password: 'old' }];
    const rows = [
      { url: 'https://A.com:443/login', username: 'bob', password: 'old' }, // duplicate
      { url: 'https://a.com/', username: 'bob', password: 'new' }, // conflict with vault
      { url: 'https://b.com', username: 'amy', password: 'p1' }, // imported
      { url: 'https://b.com/x', username: 'amy', password: 'p1' }, // duplicate of earlier row
      { url: 'https://b.com', username: 'amy', password: 'p2' }, // conflict with earlier row
      { url: '', username: 'x', password: 'y' }, // missing-url
      { url: 'ftp://c.com', username: 'x', password: 'y' }, // invalid-url
      { url: 'https://c.com', username: '', password: 'y' }, // missing-username
      { url: 'https://c.com', username: 'x', password: '' }, // missing-password
    ];
    const r = classifyImport(rows, existing);
    expect(r.counts).toEqual({ imported: 1, duplicate: 2, conflict: 2, invalid: 4, total: 9 });
    expect(r.imported[0]).toMatchObject({ origin: 'https://b.com', username: 'amy' });
    expect(r.conflict.map((c) => c.conflictsWith)).toEqual(['existing', 'import']);
    expect(r.invalid.map((i) => i.reason)).toEqual([
      'missing-url',
      'invalid-url',
      'missing-username',
      'missing-password',
    ]);
  });
});
