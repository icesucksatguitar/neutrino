// Task 12.11: Settings passwords section helpers and markup.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ENCRYPTION_UNAVAILABLE_MESSAGE,
  REVEAL_MS,
  VERIFICATION_FAILED_MESSAGE,
  addReveal,
  defaultConflictChoices,
  describePasswordError,
  filterCredentials,
  hideReveal,
  importSummaryText,
  msUntilNextExpiry,
  notPossibleMessage,
  prepareSummaryText,
  pruneReveals,
} from '../../../src/renderer/utils/passwordSettings';
import { PasswordsSettings } from '../../../src/renderer/components/PasswordsSettings';
import type { CredentialListItem } from '../../../src/renderer/types';

const cred = (id: string, origin: string, username: string): CredentialListItem => ({
  id,
  origin,
  username,
  createdAt: 0,
  lastUsedAt: 0,
  unreadable: false,
});

describe('reveal bookkeeping (R10.2)', () => {
  it('expires a revealed password after 30 seconds', () => {
    const m = addReveal({}, 'a', 'pw', 1000);
    expect(REVEAL_MS).toBe(30_000);
    expect(m.a).toEqual({ password: 'pw', expiresAt: 31_000 });
    expect(msUntilNextExpiry(m, 1000)).toBe(30_000);
    expect(pruneReveals(m, 30_999)).toBe(m);
    expect(pruneReveals(m, 31_000)).toEqual({});
  });

  it('tracks the soonest expiry and hides one entry at a time', () => {
    let m = addReveal({}, 'a', 'x', 0);
    m = addReveal(m, 'b', 'y', 5000);
    expect(msUntilNextExpiry(m, 1000)).toBe(29_000);
    expect(Object.keys(pruneReveals(m, 30_000))).toEqual(['b']);
    expect(Object.keys(hideReveal(m, 'a'))).toEqual(['b']);
    expect(hideReveal(m, 'zz')).toBe(m);
    expect(msUntilNextExpiry({}, 0)).toBeNull();
  });

  it('re-revealing restarts the timer', () => {
    const m = addReveal(addReveal({}, 'a', 'x', 0), 'a', 'x', 10_000);
    expect(m.a.expiresAt).toBe(40_000);
  });
});

describe('search (R9.5)', () => {
  const list = [cred('1', 'https://github.com', 'ada'), cred('2', 'https://example.org', 'GRACE')];

  it('matches origin or username, case-insensitively', () => {
    expect(filterCredentials(list, 'GIT').map((c) => c.id)).toEqual(['1']);
    expect(filterCredentials(list, 'grace').map((c) => c.id)).toEqual(['2']);
    expect(filterCredentials(list, 'https').map((c) => c.id)).toEqual(['1', '2']);
    expect(filterCredentials(list, 'nope')).toEqual([]);
  });

  it('returns everything for blank text', () => {
    expect(filterCredentials(list, '   ')).toHaveLength(2);
  });
});

describe('messages', () => {
  it('maps cancelled and failed verification to the same message (R10.6)', () => {
    expect(describePasswordError('cancelled')).toBe(VERIFICATION_FAILED_MESSAGE);
    expect(describePasswordError('failed')).toBe(VERIFICATION_FAILED_MESSAGE);
  });

  it('explains encryption unavailable (R7.2, R11.8)', () => {
    expect(describePasswordError('encryption-unavailable')).toBe(ENCRYPTION_UNAVAILABLE_MESSAGE);
    expect(ENCRYPTION_UNAVAILABLE_MESSAGE).toMatch(/system encryption is unavailable/);
  });

  it('falls back to the main-process message, then a generic one', () => {
    expect(describePasswordError('weird', 'From main.')).toBe('From main.');
    expect(describePasswordError(undefined)).toMatch(/went wrong/);
  });

  it('says direct import is not possible and points to CSV (R11.7)', () => {
    for (const cause of ['app-bound', 'decrypt-failed', 'no-browser-data', 'something-new']) {
      const text = notPossibleMessage(cause);
      expect(text).toMatch(/^Direct import is not possible\./);
      expect(text).toMatch(/CSV/);
    }
  });
});

describe('import summaries (R11.2, R11.4)', () => {
  it('reports imported, duplicate and invalid counts', () => {
    expect(importSummaryText({ ok: true, imported: 3, replaced: 1, kept: 0, duplicate: 2, invalid: 1 })).toBe(
      'Imported 4 passwords, skipped 2 as duplicates, rejected 1 as invalid.',
    );
    expect(importSummaryText({ ok: true, imported: 1, replaced: 0, kept: 2, duplicate: 0, invalid: 0 })).toMatch(
      /^Imported 1 password, .* Kept the current password for 2 conflicts\.$/,
    );
  });

  it('summarizes a prepared import with its conflicts', () => {
    expect(prepareSummaryText({ imported: 1, duplicate: 0, conflict: 2, invalid: 3 })).toBe(
      'Found 1 new password, 0 skipped as duplicates, 3 rejected as invalid, 2 conflicts to resolve.',
    );
    expect(prepareSummaryText({ imported: 0, duplicate: 1, conflict: 0, invalid: 0 })).not.toMatch(/conflict/);
  });

  it('defaults every conflict to keep and preserves earlier choices', () => {
    const conflicts = [
      { index: 0, origin: 'https://a.com', username: 'u', conflictsWith: 'existing' as const },
      { index: 1, origin: 'https://b.com', username: 'v', conflictsWith: 'import' as const },
    ];
    expect(defaultConflictChoices(conflicts)).toEqual({ 0: 'keep', 1: 'keep' });
    expect(defaultConflictChoices(conflicts, { 1: 'replace', 7: 'replace' })).toEqual({ 0: 'keep', 1: 'replace' });
  });
});

describe('PasswordsSettings markup', () => {
  const html = renderToStaticMarkup(createElement(PasswordsSettings));

  it('uses its own heading class, not settings-section-title', () => {
    expect(html).toContain('<h3 class="settings-group-title">Passwords</h3>');
    expect(html).not.toContain('settings-section-title');
  });

  it('labels every button and input', () => {
    const controls = html.match(/<(button|input)\b[^>]*>/g) ?? [];
    expect(controls.length).toBeGreaterThanOrEqual(3);
    for (const tag of controls) expect(tag).toMatch(/aria-label="[^"]+"/);
  });

  it('offers search, CSV import and Chrome/Edge import', () => {
    expect(html).toContain('aria-label="Search saved passwords"');
    expect(html).toContain('aria-label="Import passwords from a CSV file"');
    expect(html).toContain('aria-label="Import passwords from Chrome or Edge"');
  });
});
