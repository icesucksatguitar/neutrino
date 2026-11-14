/**
 * Best-effort Chrome/Edge password import (R11.5–11.7, R11.9).
 *
 * Chromium on Windows stores each `password_value` in `Login Data` as:
 *
 *   'v10' (3 bytes) | nonce (12 bytes) | ciphertext (n bytes) | GCM tag (16 bytes)
 *
 * encrypted with AES-256-GCM under the `os_crypt.encrypted_key` from
 * `Local State` (itself DPAPI-wrapped). Newer Chrome builds use a `v20`
 * prefix (App_Bound_Encryption), whose key only the browser's elevated
 * service can unwrap, so those blobs cannot be imported directly and the
 * user is pointed at CSV export instead (R11.7).
 *
 * This module holds two layers:
 * - the pure blob layer: `classifyChromeBlob` (total, never throws) and
 *   `decryptV10` (AES-256-GCM decrypt, returns null on any failure);
 * - the direct `Login Data` / `Local State` reader (task 10.9) below the
 *   "Direct reader" marker, which locates the browser profiles, unwraps the
 *   `os_crypt` key via the native DPAPI helper, reads the `logins` table with
 *   the dependency-free SQLite reader (`sqliteReader.ts`) and decrypts v10
 *   blobs. Any App_Bound (`v20`) data or decrypt/parse failure yields the
 *   "direct import not possible" fallback with CSV-export steps (R11.7).
 *
 * All filesystem, child-process, path and environment access is injected so
 * the reader can be unit tested with a hand-built fixture (task 10.10) and so
 * this file keeps no Electron imports. Sources are opened read-only; the
 * temporary `Login Data` copy and every decrypted value are discarded after
 * the read, whether it succeeds or fails (R11.9).
 */

import { createDecipheriv } from 'node:crypto';
import { execFileSync as nodeExecFileSync } from 'node:child_process';
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import * as nodeOs from 'node:os';
import { resolveHelperPath } from './osAuth';
import { readTable, SqliteError, type SqliteValue } from './sqliteReader';
import type { CsvCredentialRow } from './csv';

// ---------------------------------------------------------------------------
// Blob format
// ---------------------------------------------------------------------------

export type ChromeBlobKind = 'v10' | 'v20-app-bound' | 'undecryptable';

export const V10_PREFIX_LENGTH = 3;
export const V10_NONCE_LENGTH = 12;
export const V10_TAG_LENGTH = 16;
/** AES-256 key length in bytes. */
export const V10_KEY_LENGTH = 32;
/** Smallest well-formed v10 blob: prefix + nonce + tag (empty plaintext). */
export const V10_MIN_LENGTH = V10_PREFIX_LENGTH + V10_NONCE_LENGTH + V10_TAG_LENGTH;

// ASCII bytes of the version prefixes.
const V = 0x76; // 'v'
const ONE = 0x31; // '1'
const TWO = 0x32; // '2'
const ZERO = 0x30; // '0'

function hasPrefix(bytes: Uint8Array, b1: number): boolean {
  return bytes.length >= V10_PREFIX_LENGTH && bytes[0] === V && bytes[1] === b1 && bytes[2] === ZERO;
}

/**
 * Classify a Chromium `password_value` blob by its version prefix.
 *
 * - `'v10'`: `v10` prefix and long enough to hold nonce and tag.
 * - `'v20-app-bound'`: `v20` prefix (App_Bound_Encryption), regardless of length.
 * - `'undecryptable'`: anything else (empty, other prefixes such as `v11`,
 *   legacy raw DPAPI blobs, truncated v10, non-byte input).
 *
 * Pure and total: never throws.
 */
export function classifyChromeBlob(bytes: Uint8Array): ChromeBlobKind {
  try {
    if (!(bytes instanceof Uint8Array)) return 'undecryptable';
    if (hasPrefix(bytes, TWO)) return 'v20-app-bound';
    if (hasPrefix(bytes, ONE) && bytes.length >= V10_MIN_LENGTH) return 'v10';
    return 'undecryptable';
  } catch {
    return 'undecryptable';
  }
}

/**
 * Decrypt a v10 blob with the (already DPAPI-unwrapped) 32-byte os_crypt key.
 *
 * Returns the plaintext bytes, or null when the key is the wrong size, the
 * blob is not a well-formed v10 blob, or GCM authentication fails. Callers
 * treat null as "direct import not possible" (R11.7). Never throws.
 */
export function decryptV10(key: Uint8Array, blob: Uint8Array): Buffer | null {
  try {
    if (!(key instanceof Uint8Array) || key.length !== V10_KEY_LENGTH) return null;
    if (classifyChromeBlob(blob) !== 'v10') return null;

    const nonceEnd = V10_PREFIX_LENGTH + V10_NONCE_LENGTH;
    const tagStart = blob.length - V10_TAG_LENGTH;
    const nonce = blob.subarray(V10_PREFIX_LENGTH, nonceEnd);
    const ciphertext = blob.subarray(nonceEnd, tagStart);
    const tag = blob.subarray(tagStart);

    const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: V10_TAG_LENGTH });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Direct reader (task 10.9): Local State key unwrap + Login Data reader.
// ---------------------------------------------------------------------------

/** The DPAPI envelope prefix Chromium writes before the wrapped os_crypt key. */
const DPAPI_PREFIX = 'DPAPI';

/** Which browser a set of profiles belongs to. */
export type ChromeBrowser = 'chrome' | 'edge';

/** Columns we read out of the `logins` table. */
const COL_ORIGIN = 'origin_url';
const COL_USERNAME = 'username_value';
const COL_PASSWORD = 'password_value';

/**
 * Why a direct import could not run. The renderer maps this to a message and,
 * for every case, shows the CSV-export steps (R11.7).
 */
export type NotPossibleCause =
  | 'unsupported-platform' // not Windows
  | 'no-browser-data' // no Chrome/Edge profile with a Login Data file
  | 'key-unavailable' // Local State missing/invalid, or DPAPI unwrap failed
  | 'app-bound' // v20 / App_Bound_Encryption blobs present
  | 'decrypt-failed' // v10 decrypt failed and nothing else imported
  | 'read-failed'; // SQLite parse / file read error

export interface CsvExportSteps {
  chrome: string[];
  edge: string[];
}

/** Human steps for exporting a password CSV from each browser (R11.7). */
export const CSV_EXPORT_STEPS: CsvExportSteps = {
  chrome: [
    'Open Chrome and go to chrome://password-manager/passwords',
    'Click Settings in the Password Manager',
    'Under "Export passwords", click Download file and save the CSV',
    'Choose that CSV file in Neutrino\u2019s import dialog',
  ],
  edge: [
    'Open Edge and go to edge://wallet/passwords',
    'Click the "..." menu next to Saved passwords and choose Export passwords',
    'Confirm and save the CSV file',
    'Choose that CSV file in Neutrino\u2019s import dialog',
  ],
};

export interface DirectImportOk {
  ok: true;
  /** Decrypted credentials ready to feed the existing CSV import flow. */
  rows: CsvCredentialRow[];
  /** Which browsers contributed rows. */
  browsers: ChromeBrowser[];
}

export interface DirectImportNotPossible {
  ok: false;
  reason: 'not-possible';
  cause: NotPossibleCause;
  csvSteps: CsvExportSteps;
}

export type DirectImportResult = DirectImportOk | DirectImportNotPossible;

/** `child_process.execFileSync`-shaped call used to run the DPAPI helper. */
export type ExecFileSyncFn = (
  file: string,
  args: readonly string[],
  options: { input: string; timeout: number; windowsHide: boolean; maxBuffer: number },
) => string | Buffer;

/** Injected filesystem surface (all synchronous, read-only on the sources). */
export interface ChromeImportFs {
  existsSync(p: string): boolean;
  readFileSync(p: string): Buffer;
  readdirSync(p: string): string[];
  copyFileSync(src: string, dst: string): void;
  mkdtempSync(prefix: string): string;
  rmSync(p: string, options?: { force?: boolean; recursive?: boolean }): void;
}

export interface ChromeImportDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** `app.isPackaged`; selects the helper path (see osAuth.resolveHelperPath). */
  isPackaged: boolean;
  /** `process.resourcesPath` (used when packaged). */
  resourcesPath: string;
  /** `app.getAppPath()` (used in development). */
  appRoot: string;
  fs?: ChromeImportFs;
  path?: Pick<typeof nodePath, 'join'>;
  tmpdir?: () => string;
  /**
   * Unwrap a DPAPI blob. Default spawns the native helper
   * `neutrino-core.exe dpapi-unprotect` with the base64 blob on stdin and
   * parses its `{"result":"ok","data":"<base64>"}` line. Returns null on any
   * failure. Injected directly in tests to avoid spawning a process.
   */
  dpapiUnprotect?: (blobBase64: string) => Buffer | null;
  execFileSync?: ExecFileSyncFn;
  helperTimeoutMs?: number;
}

const DEFAULT_HELPER_TIMEOUT_MS = 30_000;
const MAX_HELPER_OUTPUT = 1024 * 1024;

function defaultFs(): ChromeImportFs {
  return {
    existsSync: nodeFs.existsSync,
    readFileSync: nodeFs.readFileSync,
    readdirSync: (p) => nodeFs.readdirSync(p),
    copyFileSync: nodeFs.copyFileSync,
    mkdtempSync: nodeFs.mkdtempSync,
    rmSync: (p, options) => nodeFs.rmSync(p, options),
  };
}

/**
 * Parse the native helper's one-line JSON output into the unwrapped bytes.
 * Returns null unless the line is `{"result":"ok","data":"<base64>"}`.
 */
export function parseDpapiOutput(stdout: string): Buffer | null {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]) as { result?: unknown; data?: unknown };
      if (obj && obj.result === 'ok' && typeof obj.data === 'string') {
        return Buffer.from(obj.data, 'base64');
      }
    } catch {
      // not JSON; keep scanning
    }
  }
  return null;
}

function makeDefaultDpapi(deps: ChromeImportDeps): (blobBase64: string) => Buffer | null {
  const exec: ExecFileSyncFn = deps.execFileSync ?? (nodeExecFileSync as unknown as ExecFileSyncFn);
  const helper = resolveHelperPath({
    isPackaged: deps.isPackaged,
    resourcesPath: deps.resourcesPath,
    appRoot: deps.appRoot,
  });
  const timeout = deps.helperTimeoutMs ?? DEFAULT_HELPER_TIMEOUT_MS;
  return (blobBase64: string): Buffer | null => {
    try {
      const out = exec(helper, ['dpapi-unprotect'], {
        input: blobBase64,
        timeout,
        windowsHide: true,
        maxBuffer: MAX_HELPER_OUTPUT,
      });
      return parseDpapiOutput(typeof out === 'string' ? out : out.toString('utf8'));
    } catch {
      return null;
    }
  };
}

/**
 * Pull the DPAPI-wrapped `os_crypt.encrypted_key` out of a `Local State` JSON
 * document and return it base64-decoded with the leading `DPAPI` tag removed,
 * ready to hand to the unwrap helper. Returns null if the field is missing or
 * the envelope is malformed. Never throws.
 */
export function extractEncryptedKey(localStateText: string): Buffer | null {
  try {
    const parsed = JSON.parse(localStateText) as { os_crypt?: { encrypted_key?: unknown } };
    const encoded = parsed?.os_crypt?.encrypted_key;
    if (typeof encoded !== 'string' || encoded.length === 0) return null;
    const raw = Buffer.from(encoded, 'base64');
    if (raw.length <= DPAPI_PREFIX.length) return null;
    if (raw.subarray(0, DPAPI_PREFIX.length).toString('ascii') !== DPAPI_PREFIX) return null;
    return raw.subarray(DPAPI_PREFIX.length);
  } catch {
    return null;
  }
}

/** The outcome of decrypting one browser profile's `logins` table. */
interface ProfileReadResult {
  rows: CsvCredentialRow[];
  sawAppBound: boolean;
  sawDecryptFail: boolean;
}

function valueToString(value: SqliteValue | undefined): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  if (value == null) return '';
  return String(value);
}

function valueToBytes(value: SqliteValue | undefined): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return new Uint8Array();
}

/**
 * Decrypt every row of a `Login Data` SQLite buffer with the unwrapped key.
 * Empty password blobs are skipped silently (no stored password). A v20 blob
 * flags App_Bound; a failed v10 decrypt flags a decrypt failure. Throws
 * `SqliteError` (caller maps to read-failed) on a malformed database.
 */
export function readLoginsTable(dbBytes: Uint8Array, key: Uint8Array): ProfileReadResult {
  const table = readTable(dbBytes, 'logins');
  const col = (name: string) => table.columns.indexOf(name);
  const originIdx = col(COL_ORIGIN);
  const userIdx = col(COL_USERNAME);
  const passIdx = col(COL_PASSWORD);
  if (originIdx === -1 || userIdx === -1 || passIdx === -1) {
    throw new SqliteError('logins table missing expected columns');
  }

  const result: ProfileReadResult = { rows: [], sawAppBound: false, sawDecryptFail: false };
  for (const row of table.rows) {
    const blob = valueToBytes(row.values[passIdx]);
    if (blob.length === 0) continue; // no stored password
    const kind = classifyChromeBlob(blob);
    if (kind === 'v20-app-bound') {
      result.sawAppBound = true;
      continue;
    }
    if (kind !== 'v10') {
      result.sawDecryptFail = true;
      continue;
    }
    const plaintext = decryptV10(key, blob);
    if (plaintext === null) {
      result.sawDecryptFail = true;
      continue;
    }
    const url = valueToString(row.values[originIdx]);
    const username = valueToString(row.values[userIdx]);
    result.rows.push({ url, username, password: plaintext.toString('utf8') });
    // Wipe the decrypted buffer; the string copy is discarded by the caller.
    plaintext.fill(0);
  }
  return result;
}

interface BrowserLayout {
  browser: ChromeBrowser;
  /** `<LOCALAPPDATA>\<Vendor>\<Product>\User Data`. */
  userDataDir: string;
}

function browserLayouts(deps: ChromeImportDeps): BrowserLayout[] {
  const env = deps.env ?? process.env;
  const localAppData = env.LOCALAPPDATA;
  if (!localAppData) return [];
  const join = (deps.path ?? nodePath).join;
  return [
    { browser: 'chrome', userDataDir: join(localAppData, 'Google', 'Chrome', 'User Data') },
    { browser: 'edge', userDataDir: join(localAppData, 'Microsoft', 'Edge', 'User Data') },
  ];
}

/** Profile subdirectories of a Chromium `User Data` dir that hold a Login Data file. */
function profileLoginDbs(fs: ChromeImportFs, join: typeof nodePath.join, userDataDir: string): string[] {
  if (!fs.existsSync(userDataDir)) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync(userDataDir);
  } catch {
    return [];
  }
  // Chromium profile dirs are "Default" and "Profile N"; ignore the rest.
  const profileDirs = entries.filter((name) => name === 'Default' || /^Profile\s+\d+$/i.test(name));
  const dbs: string[] = [];
  for (const dir of profileDirs) {
    const db = join(userDataDir, dir, 'Login Data');
    if (fs.existsSync(db)) dbs.push(db);
  }
  return dbs;
}

function notPossible(cause: NotPossibleCause): DirectImportNotPossible {
  return { ok: false, reason: 'not-possible', cause, csvSteps: CSV_EXPORT_STEPS };
}

/**
 * Attempt a direct Chrome/Edge password import (R11.5–11.7, R11.9).
 *
 * Locates the installed browsers' `User Data` directories, unwraps each
 * browser's `os_crypt` key through the native DPAPI helper, copies every
 * profile's `Login Data` to a temp file (sources are only read), reads the
 * `logins` table and decrypts the v10 blobs. Returns the decrypted rows for
 * the existing import flow to classify and commit.
 *
 * Returns a `not-possible` result (with CSV-export steps) when run off
 * Windows, when no browser data or key is available, when any App_Bound
 * (`v20`) blob is present, or when decryption/parsing fails with nothing
 * importable. The temp copy is always deleted and decrypted buffers wiped,
 * on success and failure alike.
 */
export function readDirectImport(deps: ChromeImportDeps): DirectImportResult {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32') return notPossible('unsupported-platform');

  const fs = deps.fs ?? defaultFs();
  const join = (deps.path ?? nodePath).join;
  const tmpdir = deps.tmpdir ?? nodeOs.tmpdir;
  const dpapiUnprotect = deps.dpapiUnprotect ?? makeDefaultDpapi(deps);

  const layouts = browserLayouts(deps);
  if (layouts.length === 0) return notPossible('no-browser-data');

  const rows: CsvCredentialRow[] = [];
  const browsers: ChromeBrowser[] = [];
  let foundAnyDb = false;
  let foundAnyKey = false;
  let sawAppBound = false;
  let sawDecryptFail = false;
  let sawReadFail = false;

  for (const layout of layouts) {
    const dbs = profileLoginDbs(fs, join, layout.userDataDir);
    if (dbs.length === 0) continue;
    foundAnyDb = true;

    // Unwrap this browser's key once from its Local State.
    const localStatePath = join(layout.userDataDir, 'Local State');
    if (!fs.existsSync(localStatePath)) continue;
    let key: Buffer | null = null;
    try {
      const encryptedKey = extractEncryptedKey(fs.readFileSync(localStatePath).toString('utf8'));
      if (encryptedKey) key = dpapiUnprotect(encryptedKey.toString('base64'));
    } catch {
      key = null;
    }
    if (!key || key.length !== V10_KEY_LENGTH) continue;
    foundAnyKey = true;

    let contributed = false;
    for (const dbPath of dbs) {
      const tempDir = fs.mkdtempSync(join(tmpdir(), 'neutrino-import-'));
      const tempCopy = join(tempDir, 'LoginData.db');
      try {
        fs.copyFileSync(dbPath, tempCopy);
        const dbBytes = fs.readFileSync(tempCopy);
        const read = readLoginsTable(dbBytes, key);
        if (read.sawAppBound) sawAppBound = true;
        if (read.sawDecryptFail) sawDecryptFail = true;
        for (const row of read.rows) {
          rows.push(row);
          contributed = true;
        }
      } catch (err) {
        if (err instanceof SqliteError) sawReadFail = true;
        else sawReadFail = true;
      } finally {
        // Always delete the temp copy, success or failure (R11.9).
        try {
          fs.rmSync(tempDir, { force: true, recursive: true });
        } catch {
          /* best effort */
        }
      }
    }
    if (contributed) browsers.push(layout.browser);
    // Wipe the unwrapped key for this browser.
    key.fill(0);
  }

  // App_Bound detection is decisive: tell the user to use CSV (R11.7).
  if (sawAppBound) {
    wipeRows(rows);
    return notPossible('app-bound');
  }
  if (rows.length > 0) {
    return { ok: true, rows, browsers };
  }
  if (!foundAnyDb) return notPossible('no-browser-data');
  if (!foundAnyKey) return notPossible('key-unavailable');
  if (sawReadFail) return notPossible('read-failed');
  if (sawDecryptFail) return notPossible('decrypt-failed');
  // Browsers present but no stored passwords: nothing to import.
  return notPossible('no-browser-data');
}

/** Overwrite row plaintext before dropping it (R11.9). */
function wipeRows(rows: CsvCredentialRow[]): void {
  for (const row of rows) {
    row.password = '';
    row.username = '';
    row.url = '';
  }
  rows.length = 0;
}
