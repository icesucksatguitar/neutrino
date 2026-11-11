import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  PasswordManager,
  type ClipboardLike,
  type FrameContext,
  type ManagerClock,
} from '../../../src/main/passwords/manager';
import { Vault } from '../../../src/main/passwords/vault';
import type { OSAuthResult } from '../../../src/main/passwords/osAuth';
import { ProfileStore } from '../../../src/main/profiles/store';
import { CURRENT_SCHEMA_VERSION, type ProfilesFile } from '../../../src/main/profiles/types';
import { createFakeSafeStorage, type FakeSafeStorage } from './helpers/fakeSafeStorage';

// ---- fakes ----------------------------------------------------------------

function manualClock(start = 1_000) {
  let t = start;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: ManagerClock & { advance(ms: number): void; pending(): number } = {
    now: () => t,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimeout(h) {
      timers.delete(h as number);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
    pending: () => timers.size,
  };
  return clock;
}

function fakeClipboard() {
  let text = '';
  const cb: ClipboardLike & { writes: string[] } = {
    writes: [],
    readText: () => text,
    writeText: (s) => {
      text = s;
      cb.writes.push(s);
    },
    clear: () => {
      text = '';
    },
  };
  return cb;
}

function scriptedAuth(results: OSAuthResult[]) {
  const calls: string[] = [];
  return {
    calls,
    verify: async (reason: string) => {
      calls.push(reason);
      return { result: results.shift() ?? 'failed' };
    },
  };
}

const twoProfiles = (): ProfilesFile => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  profiles: [
    { id: 'work', name: 'Work', createdAt: 1 },
    { id: 'home', name: 'Home', createdAt: 2 },
  ],
  spaces: [
    { id: 's1', profileId: 'work', name: 'W', icon: 'Home', color: '#000', order: 0 },
    { id: 's2', profileId: 'home', name: 'H', icon: 'Home', color: '#000', order: 0 },
  ],
  tabs: [],
  favorites: [],
  archive: [],
  neverList: {},
});

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-pm-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function setup(opts: { auth?: OSAuthResult[]; cipher?: FakeSafeStorage } = {}) {
  const cipher = opts.cipher ?? createFakeSafeStorage();
  const clock = manualClock();
  const clipboard = fakeClipboard();
  const auth = scriptedAuth(opts.auth ?? []);
  let file = twoProfiles();
  const profiles = new ProfileStore({
    read: () => file,
    write: (f) => {
      file = f;
    },
    clearSession: async () => {},
    rmFiles: () => {},
  });
  const vaults = new Map<string, Vault>();
  let n = 0;
  const vaultFor = (id: string) => {
    if (!vaults.has(id)) vaults.set(id, new Vault({ profileId: id, dir, cipher, now: clock.now, newId: () => `c${++n}` }));
    return vaults.get(id)!;
  };
  let ids = 0;
  const expired: string[] = [];
  const pm = new PasswordManager({
    vaultFor,
    profiles,
    authenticator: auth,
    clipboard,
    isEncryptionAvailable: () => cipher.isEncryptionAvailable(),
    clock,
    newId: () => `id${++ids}`,
    onPromptExpired: (id) => expired.push(id),
  });
  const vaultText = (id: string) => {
    const p = path.join(dir, `vault-${id}.json`);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  };
  return { pm, cipher, clock, clipboard, auth, profiles, vaultFor, vaultText, expired };
}

const src = { profileId: 'work', webContentsId: 7 };
const frame = (o: Partial<FrameContext> = {}): FrameContext => ({
  profileId: 'work',
  webContentsId: 7,
  frameId: '1:1',
  frameOrigin: 'https://site.test/login',
  ...o,
});

function promptOf(r: ReturnType<PasswordManager['capture']>) {
  if (r.kind !== 'prompt') throw new Error(`expected prompt, got ${r.kind}`);
  return r.prompt;
}

// ---- capture / prompts ----------------------------------------------------

describe('PasswordManager capture and prompts', () => {
  it('offers save, stores in the owning profile vault on Save, and drops the capture (R6.2, R6.5, R6.10)', () => {
    const { pm, vaultFor, vaultText } = setup();
    const p = promptOf(pm.capture(src, { origin: 'https://Site.test/login', username: 'ann', password: 'pw-1' }));
    expect(p).toEqual({ promptId: 'id1', kind: 'save', profileId: 'work', webContentsId: 7, origin: 'https://site.test', username: 'ann' });
    expect(JSON.stringify(p)).not.toContain('pw-1');
    expect(vaultText('work')).toBe('');

    const r = pm.resolvePrompt(p.promptId, 'save');
    expect(r).toMatchObject({ ok: true, action: 'save', credential: { origin: 'https://site.test', username: 'ann' } });
    expect(JSON.stringify(r)).not.toContain('pw-1');
    expect(pm.pendingPromptIds()).toEqual([]);
    expect(vaultFor('work').list().map((c) => c.password)).toEqual(['pw-1']);
    expect(vaultFor('home').list()).toEqual([]);
    expect(pm.resolvePrompt(p.promptId, 'save')).toMatchObject({ ok: false, error: 'expired' });
  });

  it('touches on an exact match and offers update on a different password (R6.3, R6.4, R6.6)', () => {
    const { pm, clock, vaultFor } = setup();
    vaultFor('work').add({ origin: 'https://site.test', username: 'ann', password: 'old' });
    clock.advance(500);
    expect(pm.capture(src, { origin: 'https://site.test', username: 'ann', password: 'old' })).toEqual({ kind: 'touched', credentialId: 'c1' });
    expect(vaultFor('work').get('c1')!.lastUsedAt).toBe(1500);
    expect(pm.pendingPromptIds()).toEqual([]);

    const p = promptOf(pm.capture(src, { origin: 'https://site.test', username: 'ann', password: 'new' }));
    expect(p.kind).toBe('update');
    expect(pm.resolvePrompt(p.promptId, 'save')).toMatchObject({ ok: false, error: 'invalid-action' });
    expect(pm.resolvePrompt(p.promptId, 'update')).toMatchObject({ ok: true });
    expect(vaultFor('work').list().map((c) => c.password)).toEqual(['new']);
  });

  it('Never adds to the profile never-list; removal resumes prompts (R6.7–6.9)', () => {
    const { pm } = setup();
    const p = promptOf(pm.capture(src, { origin: 'https://site.test', username: 'a', password: 'x' }));
    expect(pm.resolvePrompt(p.promptId, 'never')).toEqual({ ok: true, action: 'never' });
    expect(pm.neverList('work')).toEqual(['https://site.test']);
    expect(pm.neverList('home')).toEqual([]);
    expect(pm.capture(src, { origin: 'https://site.test/other', username: 'b', password: 'y' })).toEqual({ kind: 'suppress' });
    expect(pm.capture({ profileId: 'home', webContentsId: 8 }, { origin: 'https://site.test', username: 'b', password: 'y' }).kind).toBe('prompt');
    expect(pm.removeFromNeverList('work', 'https://SITE.test')).toEqual([]);
    expect(pm.capture(src, { origin: 'https://site.test', username: 'b', password: 'y' }).kind).toBe('prompt');
  });

  it('drops captures on not-now, dismiss, tab discard and expiry without writing (R6.10)', () => {
    const { pm, clock, vaultText, expired } = setup();
    const a = promptOf(pm.capture(src, { origin: 'https://a.test', username: 'u', password: 'secret-a' }));
    expect(pm.resolvePrompt(a.promptId, 'not-now')).toEqual({ ok: true, action: 'not-now' });
    const b = promptOf(pm.capture(src, { origin: 'https://b.test', username: 'u', password: 'secret-b' }));
    pm.resolvePrompt(b.promptId, 'dismiss');
    promptOf(pm.capture(src, { origin: 'https://c.test', username: 'u', password: 'secret-c' }));
    expect(pm.discardPromptsFor(7)).toHaveLength(1);
    const d = promptOf(pm.capture(src, { origin: 'https://d.test', username: 'u', password: 'secret-d' }));
    clock.advance(5 * 60_000);
    expect(expired).toEqual([d.promptId]);
    expect(pm.pendingPromptIds()).toEqual([]);
    expect(vaultText('work')).toBe('');
  });

  it('surfaces encryption-unavailable on save and writes nothing (R7.2)', () => {
    const { pm, cipher, vaultText } = setup();
    const p = promptOf(pm.capture(src, { origin: 'https://site.test', username: 'a', password: 'x' }));
    cipher.setAvailable(false);
    expect(pm.resolvePrompt(p.promptId, 'save')).toMatchObject({ ok: false, error: 'encryption-unavailable' });
    expect(pm.pendingPromptIds()).toEqual([]);
    expect(vaultText('work')).toBe('');
  });

  it('suppresses non-http(s) origins, empty passwords and unknown profiles', () => {
    const { pm } = setup();
    expect(pm.capture(src, { origin: 'file:///x', username: 'a', password: 'x' }).kind).toBe('suppress');
    expect(pm.capture(src, { origin: 'https://a.test', username: 'a', password: '' }).kind).toBe('suppress');
    expect(pm.capture({ profileId: 'ghost', webContentsId: 1 }, { origin: 'https://a.test', username: 'a', password: 'x' }).kind).toBe('suppress');
  });
});

// ---- autofill -------------------------------------------------------------

describe('PasswordManager autofill', () => {
  it('suggests exact-origin usernames from the tab profile only, without passwords (R8.4, R8.5)', () => {
    const { pm, vaultFor } = setup();
    vaultFor('work').add({ origin: 'https://site.test', username: 'ann', password: 'p' });
    vaultFor('home').add({ origin: 'https://site.test', username: 'bob', password: 'q' });
    expect(pm.suggestions(frame())).toEqual([{ credentialId: 'c1', username: 'ann' }]);
    expect(pm.suggestions(frame({ frameOrigin: 'http://site.test' }))).toEqual([]);
    expect(pm.suggestions(frame({ frameOrigin: 'https://site.test:8443' }))).toEqual([]);
    expect(pm.suggestions(frame({ profileId: 'home' }))).toEqual([{ credentialId: 'c2', username: 'bob' }]);
  });

  it('issues a single-use token bound to webContents, frame, origin and profile; redeem touches (R8.2, R8.3, R8.6, R8.7)', () => {
    const { pm, clock, vaultFor } = setup();
    vaultFor('work').add({ origin: 'https://site.test', username: 'ann', password: 'p' });
    expect(pm.issueFillToken(frame({ frameOrigin: 'https://evil.test' }), 'c1')).toMatchObject({ ok: false });
    expect(pm.issueFillToken(frame({ profileId: 'home' }), 'c1')).toMatchObject({ ok: false });
    const t = pm.issueFillToken(frame(), 'c1');
    if (!t.ok) throw new Error('no token');

    for (const other of [
      frame({ webContentsId: 8 }),
      frame({ frameId: '1:2' }),
      frame({ frameOrigin: 'https://evil.test' }),
      frame({ frameOrigin: 'http://site.test' }),
      frame({ profileId: 'home' }),
    ]) {
      expect(pm.redeemFillToken(other, t.token)).toMatchObject({ ok: false });
    }
    clock.advance(100);
    expect(pm.redeemFillToken(frame({ frameOrigin: 'https://site.test/next' }), t.token)).toEqual({ ok: true, username: 'ann', password: 'p' });
    expect(vaultFor('work').get('c1')!.lastUsedAt).toBe(1100);
    expect(pm.redeemFillToken(frame(), t.token)).toMatchObject({ ok: false, error: 'expired' });
  });

  it('expires unredeemed tokens', () => {
    const { pm, clock, vaultFor } = setup();
    vaultFor('work').add({ origin: 'https://site.test', username: 'ann', password: 'p' });
    const t = pm.issueFillToken(frame(), 'c1');
    if (!t.ok) throw new Error('no token');
    clock.advance(30_000);
    expect(pm.redeemFillToken(frame(), t.token)).toMatchObject({ ok: false, error: 'expired' });
  });
});

// ---- reveal / copy --------------------------------------------------------

describe('PasswordManager reveal and copy', () => {
  it('reveals plaintext only when verified; cancel/fail withhold (R10.1, R10.2, R10.6)', async () => {
    const { pm, vaultFor, auth } = setup({ auth: ['verified', 'cancelled', 'failed'] });
    vaultFor('work').add({ origin: 'https://site.test', username: 'ann', password: 'pw' });
    expect(await pm.reveal('work', 'c1')).toEqual({ status: 'ok', credentialId: 'c1', password: 'pw' });
    const cancelled = await pm.reveal('work', 'c1');
    const failed = await pm.reveal('work', 'c1');
    expect(cancelled.status).toBe('cancelled');
    expect(failed.status).toBe('failed');
    expect(JSON.stringify([cancelled, failed])).not.toContain('pw"');
    expect(auth.calls).toHaveLength(3);
    expect((await pm.reveal('home', 'c1')).status).toBe('error');
  });

  it('asks for confirmation when OS auth is unavailable and acts only on confirm (R10.5)', async () => {
    const { pm, vaultFor, auth } = setup({ auth: ['unavailable', 'unavailable'] });
    vaultFor('work').add({ origin: 'https://site.test', username: 'ann', password: 'pw' });
    const r = await pm.reveal('work', 'c1');
    if (r.status !== 'needs-confirm') throw new Error(r.status);
    expect(pm.confirm(r.confirmId, true)).toEqual({ status: 'ok', credentialId: 'c1', password: 'pw' });
    expect(pm.confirm(r.confirmId, true)).toMatchObject({ status: 'error', error: 'expired' });
    const r2 = await pm.reveal('work', 'c1');
    if (r2.status !== 'needs-confirm') throw new Error(r2.status);
    expect(pm.confirm(r2.confirmId, false).status).toBe('cancelled');
    expect(auth.calls).toHaveLength(2);
  });

  it('copy writes the clipboard in main, returns no plaintext, clears after 30s if unchanged (R10.3, R10.4)', async () => {
    const { pm, vaultFor, clipboard, clock } = setup({ auth: ['verified', 'verified'] });
    vaultFor('work').add({ origin: 'https://site.test', username: 'ann', password: 'pw-secret' });
    const r = await pm.copy('work', 'c1');
    expect(r).toEqual({ status: 'copied', credentialId: 'c1', clearAfterMs: 30_000 });
    expect(clipboard.readText()).toBe('pw-secret');
    clock.advance(29_999);
    expect(clipboard.readText()).toBe('pw-secret');
    clock.advance(1);
    expect(clipboard.readText()).toBe('');

    await pm.copy('work', 'c1');
    clipboard.writeText('something else');
    clock.advance(30_000);
    expect(clipboard.readText()).toBe('something else');
  });

  it('copy on cancel leaves the clipboard untouched', async () => {
    const { pm, vaultFor, clipboard } = setup({ auth: ['cancelled'] });
    vaultFor('work').add({ origin: 'https://site.test', username: 'ann', password: 'pw' });
    expect((await pm.copy('work', 'c1')).status).toBe('cancelled');
    expect(clipboard.writes).toEqual([]);
  });
});

// ---- settings -------------------------------------------------------------

describe('PasswordManager settings operations', () => {
  it('lists DTOs only, edits encrypted, deletes (R9.1, R9.3, R9.4)', () => {
    const { pm, vaultFor, vaultText } = setup();
    vaultFor('work').add({ origin: 'https://site.test', username: 'ann', password: 'pw' });
    const list = pm.list('work');
    expect(list).toEqual([{ id: 'c1', origin: 'https://site.test', username: 'ann', createdAt: 1000, lastUsedAt: 1000, unreadable: false }]);
    expect(pm.list('home')).toEqual([]);

    const e = pm.edit('work', 'c1', { username: 'ann2', password: 'brand-new-pw' });
    expect(e).toMatchObject({ ok: true, credential: { username: 'ann2' } });
    expect(JSON.stringify(e)).not.toContain('brand-new-pw');
    expect(vaultText('work')).not.toContain('brand-new-pw');
    expect(vaultFor('work').get('c1')!.password).toBe('brand-new-pw');
    expect(pm.edit('work', 'c1', { password: '' })).toMatchObject({ ok: false, error: 'invalid-input' });

    expect(pm.remove('home', 'c1')).toMatchObject({ ok: false, error: 'not-found' });
    expect(pm.remove('work', 'c1')).toEqual({ ok: true });
    expect(pm.list('work')).toEqual([]);
  });
});

// ---- import ---------------------------------------------------------------

describe('PasswordManager CSV import', () => {
  const csv = [
    'name,url,username,password',
    'a,https://a.test/login,ann,same',
    'b,https://b.test,bob,changed',
    'c,https://c.test,cat,fresh',
    'd,ftp://bad,dan,x',
    'e,https://c.test,cat,second',
  ].join('\n');

  it('skips duplicates, keeps conflicts by default, replaces on request, and discards the session (R11.1, R11.3, R11.4, R11.9)', () => {
    const { pm, vaultFor } = setup();
    vaultFor('work').add({ origin: 'https://a.test', username: 'ann', password: 'same' });
    vaultFor('work').add({ origin: 'https://b.test', username: 'bob', password: 'orig' });

    const prep = pm.prepareCsvImport('work', csv);
    if (!prep.ok) throw new Error(prep.error);
    expect(prep.counts).toEqual({ imported: 1, duplicate: 1, conflict: 2, invalid: 1, total: 5 });
    expect(prep.conflicts).toEqual([
      { index: 0, origin: 'https://b.test', username: 'bob', conflictsWith: 'existing' },
      { index: 1, origin: 'https://c.test', username: 'cat', conflictsWith: 'import' },
    ]);
    expect(JSON.stringify(prep)).not.toMatch(/changed|fresh|second/);

    const r = pm.commitImport(prep.importId, { 0: 'replace', 1: 'replace' });
    expect(r).toEqual({ ok: true, imported: 1, replaced: 1, kept: 0, duplicate: 1, invalid: 1 });
    const byUser = Object.fromEntries(vaultFor('work').list().map((c) => [c.username, c.password]));
    expect(byUser).toEqual({ ann: 'same', bob: 'changed', cat: 'second' });
    expect(pm.commitImport(prep.importId)).toMatchObject({ ok: false, error: 'expired' });
  });

  it('keeps existing passwords when conflicts are not replaced; cancel discards', () => {
    const { pm, vaultFor } = setup();
    vaultFor('work').add({ origin: 'https://b.test', username: 'bob', password: 'orig' });
    const prep = pm.prepareCsvImport('work', csv);
    if (!prep.ok) throw new Error(prep.error);
    expect(pm.commitImport(prep.importId)).toMatchObject({ ok: true, kept: 2, replaced: 0 });
    expect(vaultFor('work').list().find((c) => c.username === 'bob')!.password).toBe('orig');
    expect(vaultFor('work').list().find((c) => c.username === 'cat')!.password).toBe('fresh');

    const again = pm.prepareCsvImport('work', csv);
    if (!again.ok) throw new Error(again.error);
    pm.cancelImport(again.importId);
    expect(pm.commitImport(again.importId)).toMatchObject({ ok: false, error: 'expired' });
  });

  it('refuses when encryption is unavailable and imports nothing (R11.8)', () => {
    const { pm, cipher, vaultText } = setup();
    cipher.setAvailable(false);
    expect(pm.prepareCsvImport('work', csv)).toMatchObject({ ok: false, error: 'encryption-unavailable' });
    cipher.setAvailable(true);
    const prep = pm.prepareCsvImport('work', csv);
    if (!prep.ok) throw new Error(prep.error);
    cipher.setAvailable(false);
    expect(pm.commitImport(prep.importId)).toMatchObject({ ok: false, error: 'encryption-unavailable' });
    expect(vaultText('work')).toBe('');
  });

  it('reports CSV problems and expires prepared imports', () => {
    const { pm, clock } = setup();
    expect(pm.prepareCsvImport('work', '')).toMatchObject({ ok: false, error: 'csv-empty' });
    expect(pm.prepareCsvImport('work', 'a,b\n1,2')).toMatchObject({ ok: false, error: 'csv-missing-columns' });
    const prep = pm.prepareCsvImport('work', csv);
    if (!prep.ok) throw new Error(prep.error);
    clock.advance(10 * 60_000);
    expect(pm.commitImport(prep.importId)).toMatchObject({ ok: false, error: 'expired' });
  });
});
