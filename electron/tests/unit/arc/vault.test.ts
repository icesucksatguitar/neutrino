import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  Vault,
  EncryptionUnavailableError,
  VaultCorruptError,
  VaultError,
  vaultFileName,
  type VaultFs,
} from '../../../src/main/passwords/vault';
import { suggestionsFor, toListDto } from '../../../src/main/passwords/model';
import { createFakeSafeStorage, corruptBlob } from './helpers/fakeSafeStorage';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-vault-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function makeVault(profileId = 'p1', cipher = createFakeSafeStorage(), vfs?: VaultFs) {
  let n = 0;
  return new Vault({ profileId, dir, cipher, fs: vfs, now: () => 1000, newId: () => `id${++n}` });
}

describe('Vault', () => {
  it('names the file vault-<profileId>.json and rejects unsafe ids', () => {
    expect(vaultFileName('default')).toBe('vault-default.json');
    expect(makeVault('abc').filePath).toBe(path.join(dir, 'vault-abc.json'));
    expect(() => vaultFileName('../x')).toThrow();
  });

  it('round-trips passwords and stores only base64 ciphertext (R7.1)', () => {
    const v = makeVault();
    const c = v.add({ origin: 'https://Example.com/login', username: 'ann', password: 'hunter2-secret' });
    expect(c).toMatchObject({ id: 'id1', origin: 'https://example.com', password: 'hunter2-secret' });
    const raw = fs.readFileSync(v.filePath, 'utf-8');
    expect(raw).not.toContain('hunter2-secret');
    expect(raw).not.toContain('terces-2retnuh');
    const stored = v.readStored()[0];
    expect(Buffer.from(stored.passwordEnc, 'base64').toString('base64')).toBe(stored.passwordEnc);
    expect(stored).not.toHaveProperty('password');
    // A fresh instance reads the same data back.
    expect(makeVault().list()).toEqual([
      { id: 'id1', origin: 'https://example.com', username: 'ann', password: 'hunter2-secret', createdAt: 1000, lastUsedAt: 1000 },
    ]);
  });

  it('refuses every write when encryption is unavailable and leaves the file unchanged (R7.2)', () => {
    const cipher = createFakeSafeStorage();
    const v = makeVault('p1', cipher);
    const c = v.add({ origin: 'https://a.test', username: 'u', password: 'pw' });
    const before = fs.readFileSync(v.filePath, 'utf-8');
    cipher.setAvailable(false);
    expect(() => v.add({ origin: 'https://b.test', username: 'u', password: 'x' })).toThrow(EncryptionUnavailableError);
    expect(() => v.update(c.id, { username: 'z' })).toThrow(EncryptionUnavailableError);
    expect(() => v.touch(c.id, 5)).toThrow(EncryptionUnavailableError);
    expect(() => v.remove(c.id)).toThrow(EncryptionUnavailableError);
    expect(fs.readFileSync(v.filePath, 'utf-8')).toBe(before);
    try {
      v.add({ origin: 'https://b.test', username: 'u', password: 'x' });
    } catch (e) {
      expect(e).toBeInstanceOf(VaultError);
      expect((e as VaultError).code).toBe('encryption-unavailable');
    }
  });

  it('never creates a file when the first write is refused', () => {
    const v = makeVault('p1', createFakeSafeStorage({ available: false }));
    expect(() => v.add({ origin: 'https://a.test', username: 'u', password: 'pw' })).toThrow(EncryptionUnavailableError);
    expect(fs.existsSync(v.filePath)).toBe(false);
  });

  it('marks undecryptable blobs unreadable and keeps their bytes on rewrite (R7.3)', () => {
    const bad = corruptBlob('x');
    fs.writeFileSync(
      path.join(dir, 'vault-p1.json'),
      JSON.stringify({
        version: 1,
        credentials: [
          { id: 'bad', origin: 'https://a.test', username: 'u', passwordEnc: bad, createdAt: 1, lastUsedAt: 1 },
          { id: 'junk', origin: 'https://a.test', username: 'v', passwordEnc: '!!not base64!!', createdAt: 1, lastUsedAt: 1 },
        ],
      }),
    );
    const v = makeVault();
    const list = v.list();
    expect(list.map((c) => [c.id, c.unreadable, c.password])).toEqual([
      ['bad', true, undefined],
      ['junk', true, undefined],
    ]);
    expect(suggestionsFor(list, 'https://a.test')).toEqual([]);
    expect(toListDto(list).every((d) => d.unreadable)).toBe(true);

    v.add({ origin: 'https://b.test', username: 'w', password: 'ok' });
    v.touch('bad', 99);
    const stored = v.readStored();
    expect(stored.find((c) => c.id === 'bad')!.passwordEnc).toBe(bad);
    expect(stored.find((c) => c.id === 'junk')!.passwordEnc).toBe('!!not base64!!');
    expect(stored.find((c) => c.id === 'bad')!.lastUsedAt).toBe(99);
  });

  it('updates, touches and removes credentials', () => {
    const v = makeVault();
    const c = v.add({ origin: 'https://a.test', username: 'u', password: 'old' });
    const encBefore = v.readStored()[0].passwordEnc;
    v.update(c.id, { username: 'u2' });
    expect(v.readStored()[0].passwordEnc).toBe(encBefore);
    expect(v.update(c.id, { password: 'new' })).toMatchObject({ username: 'u2', password: 'new' });
    v.touch(c.id, 42);
    expect(v.get(c.id)).toMatchObject({ lastUsedAt: 42, password: 'new' });
    expect(() => v.touch('missing')).toThrow(VaultError);
    v.remove(c.id);
    expect(v.list()).toEqual([]);
  });

  it('rejects non-http(s) origins without writing', () => {
    const v = makeVault();
    expect(() => v.add({ origin: 'file:///etc/passwd', username: 'u', password: 'p' })).toThrow(VaultError);
    expect(fs.existsSync(v.filePath)).toBe(false);
  });

  it('keeps each profile in its own file (R7.4)', () => {
    const a = makeVault('pa');
    const b = makeVault('pb');
    a.add({ origin: 'https://a.test', username: 'u', password: 'pa-pass' });
    const bBefore = (b.add({ origin: 'https://a.test', username: 'u', password: 'pb-pass' }), fs.readFileSync(b.filePath, 'utf-8'));
    a.add({ origin: 'https://c.test', username: 'u', password: 'more' });
    a.deleteFile();
    expect(fs.existsSync(a.filePath)).toBe(false);
    expect(fs.readFileSync(b.filePath, 'utf-8')).toBe(bBefore);
    expect(b.list().map((c) => c.password)).toEqual(['pb-pass']);
  });

  it('leaves previous contents intact when the atomic write fails (R7.5)', () => {
    const files = new Map<string, string>();
    let fail = false;
    const memFs: VaultFs = {
      readText: (p) => files.get(p) ?? null,
      writeAtomic: (p, d) => {
        if (fail) throw new Error('disk full');
        files.set(p, d);
      },
      remove: (p) => void files.delete(p),
    };
    const v = makeVault('p1', createFakeSafeStorage(), memFs);
    v.add({ origin: 'https://a.test', username: 'u', password: 'pw' });
    const before = files.get(v.filePath);
    fail = true;
    expect(() => v.add({ origin: 'https://b.test', username: 'u', password: 'pw2' })).toThrow('disk full');
    expect(files.get(v.filePath)).toBe(before);
    expect(v.list().map((c) => c.origin)).toEqual(['https://a.test']);
  });

  it('refuses to overwrite a corrupt vault file', () => {
    fs.writeFileSync(path.join(dir, 'vault-p1.json'), '{ not json');
    const v = makeVault();
    expect(v.list()).toEqual([]);
    expect(() => v.add({ origin: 'https://a.test', username: 'u', password: 'p' })).toThrow(VaultCorruptError);
    expect(fs.readFileSync(v.filePath, 'utf-8')).toBe('{ not json');
  });
});
