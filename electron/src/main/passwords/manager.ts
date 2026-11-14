// PasswordManager: capture/save/update/never prompts, guarded autofill, verified
// reveal/copy, Settings list/edit/delete and CSV import commit (R6–R11).
//
// Everything here runs in the Main_Process. No Electron imports: the vault
// factory, never-list store (ProfileStore), OS authenticator, clipboard and
// clock are injected, so the whole flow is testable with fakes.
//
// Plaintext rules (bugfix 2.12, R6.10, R9.2, R10.3):
// - captured-but-unsaved passwords live only in `PendingCaptureStore` (memory)
//   and are dropped when their prompt closes or expires;
// - prompts, suggestions, list items and copy results never carry a password;
// - a page frame gets a password only by redeeming a single-use fill token
//   bound to its webContents, frame, origin and profile;
// - the Renderer_UI gets a password only from a verified (or confirmed) reveal.
import { createHash, randomUUID } from 'crypto';
import type { ProfilesFile } from '../profiles/types';
import type { OSAuthenticator } from './osAuth';
import { classifyImport, parseCredentialCsv, type ConflictRow, type ImportedRow } from './csv';
import {
  addToNeverList,
  decideCapture,
  normalizeOrigin,
  removeFromNeverList,
  suggestionsFor,
  toListDto,
  type Capture,
  type CredentialListItem,
  type CredView,
} from './model';
import { VaultError, type NewCredential, type Vault } from './vault';

// ---------------------------------------------------------------------------
// Injected dependencies
// ---------------------------------------------------------------------------

/** Subset of Electron `clipboard`. */
export interface ClipboardLike {
  readText(): string;
  writeText(text: string): void;
  clear(): void;
}

/** Clock and timers; tests inject a manual clock. */
export interface ManagerClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The parts of `ProfileStore` the manager needs (never-lists live in profiles.json). */
export interface NeverListStore {
  snapshot(): ProfilesFile;
  update(fn: (file: ProfilesFile) => ProfilesFile): void;
}

/** The vault operations the manager uses. `Vault` satisfies this. */
export type ManagerVault = Pick<Vault, 'list' | 'get' | 'add' | 'addMany' | 'update' | 'touch' | 'remove'>;

export interface PasswordManagerDeps {
  /** Returns the vault of one profile (one file per profile, R7.4). */
  vaultFor(profileId: string): ManagerVault;
  profiles: NeverListStore;
  authenticator: OSAuthenticator;
  clipboard: ClipboardLike;
  /** `safeStorage.isEncryptionAvailable`; import refuses up front when false (R11.8). */
  isEncryptionAvailable(): boolean;
  clock?: ManagerClock;
  newId?: () => string;
  /** How long an unanswered save/update prompt keeps its capture. Default 5 min. */
  pendingTtlMs?: number;
  /** How long a fill token stays redeemable. Default 30 s. */
  fillTokenTtlMs?: number;
  /** How long a "confirm without OS verification" offer stays valid. Default 2 min. */
  confirmTtlMs?: number;
  /** How long a prepared import keeps its plaintext rows. Default 10 min. */
  importTtlMs?: number;
  /** Clipboard auto-clear delay (R10.4). Default 30 s. */
  clipboardClearMs?: number;
  /** Called when a pending prompt expires so the UI can close it. */
  onPromptExpired?(promptId: string): void;
}

export const DEFAULT_PENDING_TTL_MS = 5 * 60_000;
export const DEFAULT_FILL_TOKEN_TTL_MS = 30_000;
export const DEFAULT_CONFIRM_TTL_MS = 2 * 60_000;
export const DEFAULT_IMPORT_TTL_MS = 10 * 60_000;
export const CLIPBOARD_CLEAR_MS = 30_000;

const systemClock: ManagerClock = {
  now: () => Date.now(),
  setTimeout(fn, ms) {
    const h = setTimeout(fn, ms);
    (h as { unref?: () => void }).unref?.();
    return h;
  },
  clearTimeout(h) {
    clearTimeout(h as ReturnType<typeof setTimeout>);
  },
};

// ---------------------------------------------------------------------------
// Results (all IPC-safe; none carry plaintext except RevealResult 'ok')
// ---------------------------------------------------------------------------

export type PasswordErrorCode =
  | 'encryption-unavailable'
  | 'vault-corrupt'
  | 'invalid-origin'
  | 'not-found'
  | 'unreadable'
  | 'invalid-input'
  | 'invalid-action'
  | 'expired';

export interface PasswordError {
  ok: false;
  error: PasswordErrorCode;
  message: string;
}

const ERROR_MESSAGES: Record<PasswordErrorCode, string> = {
  'encryption-unavailable': 'Passwords cannot be saved because system encryption is unavailable.',
  'vault-corrupt': 'The password vault file is unreadable and was not changed.',
  'invalid-origin': 'Passwords can only be saved for http and https sites.',
  'not-found': 'That saved password no longer exists.',
  unreadable: 'That saved password cannot be decrypted.',
  'invalid-input': 'The request was not valid.',
  'invalid-action': 'That action is not available for this prompt.',
  expired: 'This request has expired.',
};

function fail(error: PasswordErrorCode): PasswordError {
  return { ok: false, error, message: ERROR_MESSAGES[error] };
}

/** Map vault failures to a result; rethrow anything unexpected. */
function vaultFailure(err: unknown): PasswordError {
  if (err instanceof VaultError) return fail(err.code);
  throw err;
}

/** The tab a capture or fill request came from. `profileId` is the tab's owner. */
export interface FrameContext {
  profileId: string;
  webContentsId: number;
  /** Stable frame identity, e.g. `${processId}:${routingId}`. */
  frameId: string;
  /** URL or origin of the frame the form lives in. */
  frameOrigin: string;
}

export type CaptureSource = Pick<FrameContext, 'profileId' | 'webContentsId'>;

/** What the Renderer_UI needs to show a prompt (R6.2/6.3). No password. */
export interface PromptInfo {
  promptId: string;
  kind: 'save' | 'update';
  profileId: string;
  webContentsId: number;
  origin: string;
  username: string;
}

export type CaptureResult =
  | { kind: 'suppress' }
  | { kind: 'touched'; credentialId: string }
  | { kind: 'prompt'; prompt: PromptInfo };

export type PromptAction = 'save' | 'update' | 'never' | 'not-now' | 'dismiss';

export type PromptResult =
  | { ok: true; action: PromptAction; credential?: CredentialListItem }
  | PasswordError;

export interface Suggestion {
  credentialId: string;
  username: string;
}

export type FillTokenResult = { ok: true; token: string } | PasswordError;
export type RedeemResult = { ok: true; username: string; password: string } | PasswordError;

export type VerifyFailure = { status: 'cancelled' | 'failed'; message: string };
export type NeedsConfirm = { status: 'needs-confirm'; confirmId: string };
export type RevealResult =
  | { status: 'ok'; credentialId: string; password: string }
  | NeedsConfirm
  | VerifyFailure
  | ({ status: 'error' } & PasswordError);
export type CopyResult =
  | { status: 'copied'; credentialId: string; clearAfterMs: number }
  | NeedsConfirm
  | VerifyFailure
  | ({ status: 'error' } & PasswordError);

export interface ImportConflictInfo {
  index: number;
  origin: string;
  username: string;
  conflictsWith: 'existing' | 'import';
}

export type PrepareImportResult =
  | {
      ok: true;
      importId: string;
      counts: { imported: number; duplicate: number; conflict: number; invalid: number; total: number };
      conflicts: ImportConflictInfo[];
    }
  | PasswordError
  | { ok: false; error: 'csv-empty' | 'csv-missing-columns'; message: string; missing?: string[] };

export type ConflictChoice = 'keep' | 'replace';

export type CommitImportResult =
  | { ok: true; imported: number; replaced: number; kept: number; duplicate: number; invalid: number }
  | PasswordError;

// ---------------------------------------------------------------------------
// PendingCaptureStore (R6.10): memory only, dropped on every close path
// ---------------------------------------------------------------------------

export interface PendingCapture {
  promptId: string;
  kind: 'save' | 'update';
  profileId: string;
  webContentsId: number;
  origin: string;
  username: string;
  password: string;
  expiresAt: number;
}

export class PendingCaptureStore {
  private readonly entries = new Map<string, { entry: PendingCapture; timer: unknown }>();

  constructor(
    private readonly clock: ManagerClock,
    private readonly onExpire: (promptId: string) => void = () => {},
  ) {}

  add(entry: PendingCapture): void {
    this.drop(entry.promptId);
    const timer = this.clock.setTimeout(() => {
      if (this.entries.has(entry.promptId)) {
        this.drop(entry.promptId);
        this.onExpire(entry.promptId);
      }
    }, Math.max(0, entry.expiresAt - this.clock.now()));
    this.entries.set(entry.promptId, { entry, timer });
  }

  /** The live entry, or undefined when missing or past its expiry (which drops it). */
  get(promptId: string): PendingCapture | undefined {
    const slot = this.entries.get(promptId);
    if (!slot) return undefined;
    if (this.clock.now() >= slot.entry.expiresAt) {
      this.drop(promptId);
      return undefined;
    }
    return slot.entry;
  }

  /** Remove and forget an entry. Returns whether it existed. */
  drop(promptId: string): boolean {
    const slot = this.entries.get(promptId);
    if (!slot) return false;
    this.clock.clearTimeout(slot.timer);
    this.entries.delete(promptId);
    return true;
  }

  /** Drop every entry for a tab (tab closed or navigated away, or a newer prompt). */
  dropForWebContents(webContentsId: number): string[] {
    const ids = [...this.entries.values()]
      .filter((s) => s.entry.webContentsId === webContentsId)
      .map((s) => s.entry.promptId);
    ids.forEach((id) => this.drop(id));
    return ids;
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  clear(): void {
    for (const id of this.ids()) this.drop(id);
  }
}

// ---------------------------------------------------------------------------
// PasswordManager
// ---------------------------------------------------------------------------

interface FillToken {
  profileId: string;
  webContentsId: number;
  frameId: string;
  origin: string;
  credentialId: string;
  expiresAt: number;
}

interface ConfirmOffer {
  action: 'reveal' | 'copy';
  profileId: string;
  credentialId: string;
  expiresAt: number;
}

interface ImportSession {
  profileId: string;
  imported: ImportedRow[];
  conflicts: ConflictRow[];
  duplicate: number;
  invalid: number;
  expiresAt: number;
  timer: unknown;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const credKey = (origin: string, username: string) => `${origin}\u0000${username}`;

export class PasswordManager {
  private readonly clock: ManagerClock;
  private readonly newId: () => string;
  private readonly pending: PendingCaptureStore;
  private readonly fillTokens = new Map<string, FillToken>();
  private readonly confirms = new Map<string, ConfirmOffer>();
  private readonly imports = new Map<string, ImportSession>();
  private readonly clipboardTimers = new Set<unknown>();
  private readonly pendingTtl: number;
  private readonly fillTtl: number;
  private readonly confirmTtl: number;
  private readonly importTtl: number;
  private readonly clipboardClearMs: number;

  constructor(private readonly deps: PasswordManagerDeps) {
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? randomUUID;
    this.pendingTtl = deps.pendingTtlMs ?? DEFAULT_PENDING_TTL_MS;
    this.fillTtl = deps.fillTokenTtlMs ?? DEFAULT_FILL_TOKEN_TTL_MS;
    this.confirmTtl = deps.confirmTtlMs ?? DEFAULT_CONFIRM_TTL_MS;
    this.importTtl = deps.importTtlMs ?? DEFAULT_IMPORT_TTL_MS;
    this.clipboardClearMs = deps.clipboardClearMs ?? CLIPBOARD_CLEAR_MS;
    this.pending = new PendingCaptureStore(this.clock, (id) => deps.onPromptExpired?.(id));
  }

  // ----- capture and prompts (R6.2–6.10) -----------------------------------

  /**
   * Handle a login-form submission from a page frame. `source.profileId` must be
   * the profile that owns the tab. Returns what the Renderer_UI should show.
   */
  capture(source: CaptureSource, cap: Capture): CaptureResult {
    const origin = normalizeOrigin(cap.origin);
    if (origin === null || typeof cap.username !== 'string' || typeof cap.password !== 'string') {
      return { kind: 'suppress' };
    }
    if (cap.password === '' || !this.profileExists(source.profileId)) return { kind: 'suppress' };

    const vault = this.deps.vaultFor(source.profileId);
    const creds = vault.list();
    const decision = decideCapture(creds, this.neverListOf(source.profileId), {
      origin,
      username: cap.username,
      password: cap.password,
    });

    if (decision === 'suppress') return { kind: 'suppress' };
    if (decision === 'touch') {
      const match = creds.find(
        (c) => !c.unreadable && c.origin === origin && c.username === cap.username && c.password === cap.password,
      )!;
      this.tryTouch(vault, match.id);
      return { kind: 'touched', credentialId: match.id };
    }

    // One open prompt per tab: a newer submission replaces the older capture.
    this.pending.dropForWebContents(source.webContentsId);
    const entry: PendingCapture = {
      promptId: this.newId(),
      kind: decision,
      profileId: source.profileId,
      webContentsId: source.webContentsId,
      origin,
      username: cap.username,
      password: cap.password,
      expiresAt: this.clock.now() + this.pendingTtl,
    };
    this.pending.add(entry);
    return { kind: 'prompt', prompt: promptInfo(entry) };
  }

  /**
   * Resolve a prompt. The capture is dropped on every outcome, including a
   * failed save (the prompt closes and shows the error, R6.10/R7.2), except an
   * action the prompt does not offer, which leaves it open.
   */
  resolvePrompt(promptId: string, action: PromptAction): PromptResult {
    const entry = this.pending.get(promptId);
    if (!entry) return fail('expired');
    const allowed: PromptAction[] =
      entry.kind === 'save' ? ['save', 'never', 'not-now', 'dismiss'] : ['update', 'not-now', 'dismiss'];
    if (!allowed.includes(action)) return fail('invalid-action');
    this.pending.drop(promptId);

    try {
      switch (action) {
        case 'save': {
          const saved = this.deps.vaultFor(entry.profileId).add({
            origin: entry.origin,
            username: entry.username,
            password: entry.password,
          });
          return { ok: true, action, credential: toListDto([saved])[0] };
        }
        case 'update': {
          const vault = this.deps.vaultFor(entry.profileId);
          const match = vault.list().find((c) => c.origin === entry.origin && c.username === entry.username);
          if (!match) return fail('not-found');
          const updated = vault.update(match.id, { password: entry.password });
          this.tryTouch(vault, match.id);
          return { ok: true, action, credential: toListDto([updated])[0] };
        }
        case 'never':
          this.mutateNeverList(entry.profileId, (list) => addToNeverList(list, entry.origin));
          return { ok: true, action };
        default:
          return { ok: true, action };
      }
    } catch (err) {
      return vaultFailure(err);
    }
  }

  /** Drop open prompts for a tab that closed or navigated. Returns the dropped prompt ids. */
  discardPromptsFor(webContentsId: number): string[] {
    return this.pending.dropForWebContents(webContentsId);
  }

  /** Ids of prompts still holding a capture (for tests and diagnostics). */
  pendingPromptIds(): string[] {
    return this.pending.ids().filter((id) => this.pending.get(id) !== undefined);
  }

  // ----- autofill (R8.1–8.7) -------------------------------------------------

  /** Usernames to offer in a frame: exact frame origin, tab's profile only. No passwords. */
  suggestions(ctx: FrameContext): Suggestion[] {
    if (!this.profileExists(ctx.profileId)) return [];
    return suggestionsFor(this.deps.vaultFor(ctx.profileId).list(), ctx.frameOrigin).map((c) => ({
      credentialId: c.id,
      username: c.username,
    }));
  }

  /**
   * Issue a single-use fill token after the user picked a suggestion. The token
   * is bound to the frame's webContents, frame id, normalized origin and profile.
   */
  issueFillToken(ctx: FrameContext, credentialId: string): FillTokenResult {
    const origin = normalizeOrigin(ctx.frameOrigin);
    if (origin === null) return fail('invalid-origin');
    if (!this.profileExists(ctx.profileId)) return fail('not-found');
    const cred = this.deps.vaultFor(ctx.profileId).get(credentialId);
    if (!cred) return fail('not-found');
    if (suggestionsFor([cred], origin).length === 0) return fail(cred.unreadable ? 'unreadable' : 'not-found');

    this.pruneExpired();
    const token = this.newId();
    this.fillTokens.set(token, {
      profileId: ctx.profileId,
      webContentsId: ctx.webContentsId,
      frameId: ctx.frameId,
      origin,
      credentialId,
      expiresAt: this.clock.now() + this.fillTtl,
    });
    return { ok: true, token };
  }

  /**
   * Redeem a fill token from the frame that will set the input values. Succeeds
   * only for the same webContents, frame, origin and profile, once, before expiry.
   * A mismatched attempt leaves the token for its rightful frame.
   */
  redeemFillToken(ctx: FrameContext, token: string): RedeemResult {
    const t = this.fillTokens.get(token);
    if (!t) return fail('expired');
    if (this.clock.now() >= t.expiresAt) {
      this.fillTokens.delete(token);
      return fail('expired');
    }
    if (
      t.profileId !== ctx.profileId ||
      t.webContentsId !== ctx.webContentsId ||
      t.frameId !== ctx.frameId ||
      normalizeOrigin(ctx.frameOrigin) !== t.origin
    ) {
      return fail('invalid-input');
    }
    this.fillTokens.delete(token);

    const vault = this.deps.vaultFor(t.profileId);
    const cred = vault.get(t.credentialId);
    if (!cred) return fail('not-found');
    if (suggestionsFor([cred], t.origin).length === 0 || cred.password === undefined) {
      return fail(cred.unreadable ? 'unreadable' : 'not-found');
    }
    this.tryTouch(vault, cred.id); // R8.7
    return { ok: true, username: cred.username, password: cred.password };
  }

  // ----- reveal / copy (R9.2, R10.1–10.6) ------------------------------------

  /** Verify with the OS, then return one credential's plaintext (R10.2). */
  async reveal(profileId: string, credentialId: string): Promise<RevealResult> {
    return this.verified('reveal', profileId, credentialId) as Promise<RevealResult>;
  }

  /** Verify with the OS, then write the password to the clipboard from main (R10.3). */
  async copy(profileId: string, credentialId: string): Promise<CopyResult> {
    return this.verified('copy', profileId, credentialId) as Promise<CopyResult>;
  }

  /**
   * Answer a `needs-confirm` offer (OS verification unavailable, R10.5). The
   * action runs only when `accepted`; the offer is single use either way.
   */
  confirm(confirmId: string, accepted: boolean): RevealResult | CopyResult {
    const offer = this.confirms.get(confirmId);
    this.confirms.delete(confirmId);
    if (!offer || this.clock.now() >= offer.expiresAt) return { status: 'error', ...fail('expired') };
    if (!accepted) return { status: 'cancelled', message: 'Verification did not succeed.' };
    return this.perform(offer.action, offer.profileId, offer.credentialId);
  }

  // ----- Settings list / edit / delete / never-list (R9) ---------------------

  /** Plaintext-free list of a profile's credentials (R9.1). */
  list(profileId: string): CredentialListItem[] {
    if (!this.profileExists(profileId)) return [];
    return toListDto(this.deps.vaultFor(profileId).list());
  }

  /** Edit username and/or password; stored encrypted (R9.4). Returns the DTO only. */
  edit(
    profileId: string,
    credentialId: string,
    patch: { username?: string; password?: string },
  ): { ok: true; credential: CredentialListItem } | PasswordError {
    if (!this.profileExists(profileId)) return fail('not-found');
    const clean: { username?: string; password?: string } = {};
    if (patch.username !== undefined) {
      if (typeof patch.username !== 'string') return fail('invalid-input');
      clean.username = patch.username;
    }
    if (patch.password !== undefined) {
      if (typeof patch.password !== 'string' || patch.password === '') return fail('invalid-input');
      clean.password = patch.password;
    }
    try {
      const updated = this.deps.vaultFor(profileId).update(credentialId, clean);
      return { ok: true, credential: toListDto([updated])[0] };
    } catch (err) {
      return vaultFailure(err);
    }
  }

  /** Delete one credential (R9.3). */
  remove(profileId: string, credentialId: string): { ok: true } | PasswordError {
    if (!this.profileExists(profileId)) return fail('not-found');
    try {
      this.deps.vaultFor(profileId).remove(credentialId);
      return { ok: true };
    } catch (err) {
      return vaultFailure(err);
    }
  }

  neverList(profileId: string): string[] {
    return [...this.neverListOf(profileId)];
  }

  /** Remove an origin from the never-list so prompts resume (R6.9). */
  removeFromNeverList(profileId: string, origin: string): string[] {
    if (!this.profileExists(profileId)) return [];
    this.mutateNeverList(profileId, (list) => removeFromNeverList(list, origin));
    return this.neverList(profileId);
  }

  // ----- CSV import (R11.1–11.4, 11.8, 11.9) ---------------------------------

  /** Parse and classify a CSV against the profile's vault. Holds rows in memory until commit/cancel/expiry. */
  prepareCsvImport(profileId: string, csvText: string): PrepareImportResult {
    if (!this.profileExists(profileId) || typeof csvText !== 'string') return fail('invalid-input');
    if (!this.deps.isEncryptionAvailable()) return fail('encryption-unavailable');

    const parsed = parseCredentialCsv(csvText);
    if (!parsed.ok) {
      return parsed.error === 'empty'
        ? { ok: false, error: 'csv-empty', message: 'The file has no rows.' }
        : {
            ok: false,
            error: 'csv-missing-columns',
            message: 'The file needs url, username and password columns.',
            missing: parsed.missing,
          };
    }
    const existing = this.deps
      .vaultFor(profileId)
      .list()
      .filter((c): c is CredView & { password: string } => !c.unreadable && c.password !== undefined)
      .map((c) => ({ origin: c.origin, username: c.username, password: c.password }));
    const result = classifyImport(parsed.rows, existing);

    this.pruneExpired();
    const importId = this.newId();
    const timer = this.clock.setTimeout(() => this.cancelImport(importId), this.importTtl);
    this.imports.set(importId, {
      profileId,
      imported: result.imported,
      conflicts: result.conflict,
      duplicate: result.counts.duplicate,
      invalid: result.counts.invalid,
      expiresAt: this.clock.now() + this.importTtl,
      timer,
    });
    return {
      ok: true,
      importId,
      counts: { ...result.counts },
      conflicts: result.conflict.map((c, index) => ({
        index,
        origin: c.origin,
        username: c.username,
        conflictsWith: c.conflictsWith,
      })),
    };
  }

  /**
   * Write a prepared import. Duplicates are skipped; each conflict keeps the
   * current password unless `choices[index] === 'replace'` (R11.4). For a
   * conflict with an earlier row of the same file, "replace" means this row wins.
   * The session and its plaintext are discarded whatever the outcome (R11.9).
   */
  commitImport(importId: string, choices: Record<number, ConflictChoice> = {}): CommitImportResult {
    const session = this.imports.get(importId);
    if (!session) return fail('expired');
    // Detach first so the session is single use, and wipe its rows on every exit path.
    this.imports.delete(importId);
    this.clock.clearTimeout(session.timer);
    try {
      if (this.clock.now() >= session.expiresAt) return fail('expired');
      if (!this.deps.isEncryptionAvailable()) return fail('encryption-unavailable');
      return this.writeImport(session, choices);
    } finally {
      session.imported.length = 0;
      session.conflicts.length = 0;
    }
  }

  private writeImport(session: ImportSession, choices: Record<number, ConflictChoice>): CommitImportResult {

    const toAdd = new Map<string, NewCredential>();
    for (const row of session.imported) {
      toAdd.set(credKey(row.origin, row.username), { origin: row.origin, username: row.username, password: row.password });
    }
    const replaceExisting = new Map<string, string>();
    let kept = 0;
    session.conflicts.forEach((row, index) => {
      if (choices[index] !== 'replace') {
        kept++;
        return;
      }
      const key = credKey(row.origin, row.username);
      if (row.conflictsWith === 'import' && toAdd.has(key)) toAdd.get(key)!.password = row.password;
      else replaceExisting.set(key, row.password);
    });

    try {
      const vault = this.deps.vaultFor(session.profileId);
      const added = toAdd.size > 0 ? vault.addMany([...toAdd.values()]).length : 0;
      let replaced = 0;
      if (replaceExisting.size > 0) {
        for (const c of vault.list()) {
          const pw = replaceExisting.get(credKey(c.origin, c.username));
          if (pw === undefined) continue;
          vault.update(c.id, { password: pw });
          replaced++;
        }
      }
      return { ok: true, imported: added, replaced, kept, duplicate: session.duplicate, invalid: session.invalid };
    } catch (err) {
      return vaultFailure(err);
    }
  }

  /** Discard a prepared import and its plaintext rows. */
  cancelImport(importId: string): void {
    const session = this.imports.get(importId);
    if (!session) return;
    this.clock.clearTimeout(session.timer);
    session.imported.length = 0;
    session.conflicts.length = 0;
    this.imports.delete(importId);
  }

  /** Drop every in-memory secret and timer (app quit). Pending clipboard clears are cancelled. */
  dispose(): void {
    this.pending.clear();
    this.fillTokens.clear();
    this.confirms.clear();
    for (const id of [...this.imports.keys()]) this.cancelImport(id);
    for (const t of this.clipboardTimers) this.clock.clearTimeout(t);
    this.clipboardTimers.clear();
  }

  // ----- internals -----------------------------------------------------------

  private async verified(
    action: 'reveal' | 'copy',
    profileId: string,
    credentialId: string,
  ): Promise<RevealResult | CopyResult> {
    const precheck = this.readable(profileId, credentialId);
    if (!precheck.ok) return { status: 'error', ...precheck };

    const reason = action === 'reveal' ? 'Show a saved password' : 'Copy a saved password';
    let outcome: Awaited<ReturnType<OSAuthenticator['verify']>>;
    try {
      outcome = await this.deps.authenticator.verify(reason);
    } catch {
      outcome = { result: 'failed' };
    }
    switch (outcome.result) {
      case 'verified':
        return this.perform(action, profileId, credentialId);
      case 'unavailable': {
        this.pruneExpired();
        const confirmId = this.newId();
        this.confirms.set(confirmId, {
          action,
          profileId,
          credentialId,
          expiresAt: this.clock.now() + this.confirmTtl,
        });
        return { status: 'needs-confirm', confirmId };
      }
      case 'cancelled':
        return { status: 'cancelled', message: 'Verification did not succeed.' };
      default:
        return { status: 'failed', message: 'Verification did not succeed.' };
    }
  }

  /** Run a verified/confirmed reveal or copy. Re-reads the credential so the latest password is used. */
  private perform(action: 'reveal' | 'copy', profileId: string, credentialId: string): RevealResult | CopyResult {
    const r = this.readable(profileId, credentialId);
    if (!r.ok) return { status: 'error', ...r };
    if (action === 'reveal') return { status: 'ok', credentialId, password: r.password };
    this.writeClipboard(r.password);
    return { status: 'copied', credentialId, clearAfterMs: this.clipboardClearMs };
  }

  private readable(
    profileId: string,
    credentialId: string,
  ): { ok: true; password: string } | PasswordError {
    if (!this.profileExists(profileId)) return fail('not-found');
    const cred = this.deps.vaultFor(profileId).get(credentialId);
    if (!cred) return fail('not-found');
    if (cred.unreadable || cred.password === undefined) return fail('unreadable');
    return { ok: true, password: cred.password };
  }

  /** Write to the clipboard; after the delay clear it only if it still holds this password (R10.4). */
  private writeClipboard(password: string): void {
    this.deps.clipboard.writeText(password);
    const digest = sha256(password); // keep only a digest for the later comparison
    const timer: unknown = this.clock.setTimeout(() => {
      this.clipboardTimers.delete(timer);
      let current: string;
      try {
        current = this.deps.clipboard.readText();
      } catch {
        return;
      }
      if (sha256(current) === digest) this.deps.clipboard.clear();
    }, this.clipboardClearMs);
    this.clipboardTimers.add(timer);
  }

  /** Last-used update; best effort (a refused write must not turn a login into an error). */
  private tryTouch(vault: ManagerVault, id: string): void {
    try {
      vault.touch(id, this.clock.now());
    } catch (err) {
      if (!(err instanceof VaultError)) throw err;
    }
  }

  private profileExists(profileId: string): boolean {
    return typeof profileId === 'string' && this.deps.profiles.snapshot().profiles.some((p) => p.id === profileId);
  }

  private neverListOf(profileId: string): string[] {
    return this.deps.profiles.snapshot().neverList[profileId] ?? [];
  }

  private mutateNeverList(profileId: string, fn: (list: string[]) => string[]): void {
    this.deps.profiles.update((file) => ({
      ...file,
      neverList: { ...file.neverList, [profileId]: fn(file.neverList[profileId] ?? []) },
    }));
  }

  private pruneExpired(): void {
    const now = this.clock.now();
    for (const [k, t] of this.fillTokens) if (now >= t.expiresAt) this.fillTokens.delete(k);
    for (const [k, c] of this.confirms) if (now >= c.expiresAt) this.confirms.delete(k);
  }
}

function promptInfo(e: PendingCapture): PromptInfo {
  return {
    promptId: e.promptId,
    kind: e.kind,
    profileId: e.profileId,
    webContentsId: e.webContentsId,
    origin: e.origin,
    username: e.username,
  };
}
