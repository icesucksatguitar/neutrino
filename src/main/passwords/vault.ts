// Per-profile encrypted password vault (R7.1–7.5).
//
// One file per profile: `vault-<profileId>.json`. Passwords are stored only as
// `passwordEnc` (base64 of the injected cipher's `encryptString`). The cipher is
// Electron `safeStorage` in production and a fake in tests, so this module has
// no Electron import. Writes fail closed: `isEncryptionAvailable()` is checked
// before every write and the write is refused with `EncryptionUnavailableError`
// when it reports false. Blobs that fail to decrypt are kept byte-for-byte and
// surfaced as `unreadable: true`.
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { writeFileAtomicSync } from '../atomicFile';
import { normalizeOrigin, type CredView } from './model';

/** The subset of Electron `safeStorage` the vault needs. */
export interface VaultCipher {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** File operations the vault needs; injectable so tests can simulate failures. */
export interface VaultFs {
  /** File text, or null when the file does not exist. */
  readText(filePath: string): string | null;
  /** Replace the file atomically: on failure the previous contents stay intact. */
  writeAtomic(filePath: string, data: string): void;
  /** Delete the file if it exists. */
  remove(filePath: string): void;
}

/** Default fs: real disk, atomic temp+rename via `atomicFile.ts`. */
export const nodeVaultFs: VaultFs = {
  readText(filePath) {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  },
  writeAtomic(filePath, data) {
    writeFileAtomicSync(filePath, data);
  },
  remove(filePath) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  },
};

/** One credential as stored on disk. Never contains plaintext. */
export interface StoredCredential {
  id: string;
  origin: string;
  username: string;
  /** base64 of `encryptString(password)`; kept verbatim when it cannot be decrypted. */
  passwordEnc: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface VaultFile {
  version: 1;
  credentials: StoredCredential[];
}

export type VaultErrorCode = 'encryption-unavailable' | 'vault-corrupt' | 'invalid-origin' | 'not-found';

/** Base class so callers can catch every vault failure and read `code`. */
export class VaultError extends Error {
  constructor(
    readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

/** R7.2: the OS cipher is unavailable, so nothing is written. */
export class EncryptionUnavailableError extends VaultError {
  constructor() {
    super(
      'encryption-unavailable',
      'Passwords cannot be saved because system encryption is unavailable.',
    );
    this.name = 'EncryptionUnavailableError';
  }
}

/** The vault file exists but cannot be parsed; writes are refused so it is not clobbered. */
export class VaultCorruptError extends VaultError {
  constructor(filePath: string) {
    super('vault-corrupt', `Vault file is unreadable and will not be overwritten: ${filePath}`);
    this.name = 'VaultCorruptError';
  }
}

export interface NewCredential {
  origin: string;
  username: string;
  password: string;
  createdAt?: number;
  lastUsedAt?: number;
}

export interface VaultOptions {
  profileId: string;
  /** Directory holding the vault file (userData in production). */
  dir: string;
  cipher: VaultCipher;
  fs?: VaultFs;
  now?: () => number;
  newId?: () => string;
}

/** File name for a profile's vault (R7.4: one file per profile). */
export function vaultFileName(profileId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(profileId)) {
    throw new Error(`Invalid profile id for vault file: ${JSON.stringify(profileId)}`);
  }
  return `vault-${profileId}.json`;
}

type LoadResult = { ok: true; file: VaultFile } | { ok: false };

function isStoredCredential(v: unknown): v is StoredCredential {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.origin === 'string' &&
    typeof r.username === 'string' &&
    typeof r.passwordEnc === 'string' &&
    typeof r.createdAt === 'number' &&
    typeof r.lastUsedAt === 'number'
  );
}

export class Vault {
  readonly profileId: string;
  readonly filePath: string;
  private readonly cipher: VaultCipher;
  private readonly fs: VaultFs;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(opts: VaultOptions) {
    this.profileId = opts.profileId;
    this.filePath = path.join(opts.dir, vaultFileName(opts.profileId));
    this.cipher = opts.cipher;
    this.fs = opts.fs ?? nodeVaultFs;
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? randomUUID;
  }

  /** Raw stored records (no decryption). Empty when the file is missing or corrupt. */
  readStored(): StoredCredential[] {
    const r = this.load();
    return r.ok ? r.file.credentials.map((c) => ({ ...c })) : [];
  }

  /** Decrypted view of every credential; undecryptable ones are `unreadable` with no password. */
  list(): CredView[] {
    return this.readStored().map((c) => this.toView(c));
  }

  get(id: string): CredView | undefined {
    const c = this.readStored().find((x) => x.id === id);
    return c ? this.toView(c) : undefined;
  }

  /** Encrypt and store a new credential (R7.1). */
  add(input: NewCredential): CredView {
    return this.addMany([input])[0];
  }

  /** Encrypt and store several credentials in one atomic write (used by import). */
  addMany(inputs: readonly NewCredential[]): CredView[] {
    const added: CredView[] = [];
    this.mutate((creds) => {
      for (const input of inputs) {
        const origin = normalizeOrigin(input.origin);
        if (origin === null) {
          throw new VaultError('invalid-origin', `Not an http(s) origin: ${input.origin}`);
        }
        const t = this.now();
        const stored: StoredCredential = {
          id: this.newId(),
          origin,
          username: input.username,
          passwordEnc: this.encrypt(input.password),
          createdAt: input.createdAt ?? t,
          lastUsedAt: input.lastUsedAt ?? input.createdAt ?? t,
        };
        creds.push(stored);
        added.push({ ...this.viewFields(stored), password: input.password });
      }
      return creds;
    });
    return added;
  }

  /** Edit username and/or password (R6.6, R9.4). A new password is re-encrypted; otherwise the blob is untouched. */
  update(id: string, patch: { username?: string; password?: string }): CredView {
    let result: CredView | undefined;
    this.mutate((creds) => {
      const c = this.requireById(creds, id);
      if (patch.username !== undefined) c.username = patch.username;
      if (patch.password !== undefined) c.passwordEnc = this.encrypt(patch.password);
      result = this.toView(c);
      return creds;
    });
    return result!;
  }

  /** Set the last-used time (R6.4, R8.7). */
  touch(id: string, at: number = this.now()): void {
    this.mutate((creds) => {
      this.requireById(creds, id).lastUsedAt = at;
      return creds;
    });
  }

  /** Remove one credential (R9.3). */
  remove(id: string): void {
    this.mutate((creds) => {
      this.requireById(creds, id);
      return creds.filter((c) => c.id !== id);
    });
  }

  /** Delete the vault file entirely (profile deletion, R1.8). Needs no encryption. */
  deleteFile(): void {
    this.fs.remove(this.filePath);
  }

  // ---- internals ----

  private load(): LoadResult {
    const text = this.fs.readText(this.filePath);
    if (text === null || text.trim() === '') return { ok: true, file: { version: 1, credentials: [] } };
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return { ok: false };
      const list = (parsed as { credentials?: unknown }).credentials;
      if (!Array.isArray(list) || !list.every(isStoredCredential)) return { ok: false };
      return { ok: true, file: { version: 1, credentials: list } };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Every write goes through here: check the cipher first (fail closed), refuse
   * to overwrite a corrupt file, then write the whole file atomically. Records
   * not touched by `fn` keep their stored bytes verbatim.
   */
  private mutate(fn: (creds: StoredCredential[]) => StoredCredential[]): void {
    if (!this.cipher.isEncryptionAvailable()) throw new EncryptionUnavailableError();
    const r = this.load();
    if (!r.ok) throw new VaultCorruptError(this.filePath);
    const next = fn(r.file.credentials);
    const file: VaultFile = { version: 1, credentials: next };
    this.fs.writeAtomic(this.filePath, JSON.stringify(file, null, 2));
  }

  private encrypt(password: string): string {
    // Re-check per blob so a cipher that becomes unavailable mid-batch never yields plaintext.
    if (!this.cipher.isEncryptionAvailable()) throw new EncryptionUnavailableError();
    return this.cipher.encryptString(password).toString('base64');
  }

  private requireById(creds: StoredCredential[], id: string): StoredCredential {
    const c = creds.find((x) => x.id === id);
    if (!c) throw new VaultError('not-found', `No credential with id ${id}`);
    return c;
  }

  private viewFields(c: StoredCredential): CredView {
    return {
      id: c.id,
      origin: c.origin,
      username: c.username,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    };
  }

  private toView(c: StoredCredential): CredView {
    const view = this.viewFields(c);
    try {
      const password = this.cipher.decryptString(Buffer.from(c.passwordEnc, 'base64'));
      if (typeof password !== 'string') throw new Error('decrypt returned non-string');
      return { ...view, password };
    } catch {
      return { ...view, unreadable: true };
    }
  }
}
