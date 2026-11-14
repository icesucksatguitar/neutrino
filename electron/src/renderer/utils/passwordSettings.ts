// Pure helpers for the Settings passwords section (task 12.11). No DOM, no IPC.
import type {
  CommitImportResult,
  CredentialListItem,
  CsvExportSteps,
  ImportConflictInfo,
  NotPossibleCause,
  ConflictChoice,
} from '../types';

/** Revealed plaintext is hidden again after this long (R10.2). */
export const REVEAL_MS = 30_000;

export const VERIFICATION_FAILED_MESSAGE = 'Verification did not succeed.';
export const ENCRYPTION_UNAVAILABLE_MESSAGE =
  'Passwords cannot be saved because system encryption is unavailable.';
export const UNREADABLE_LABEL = 'Unreadable';

// ---------------------------------------------------------------------------
// Reveal bookkeeping. The map lives only in component state (never persisted).
// ---------------------------------------------------------------------------

export interface RevealEntry {
  password: string;
  expiresAt: number;
}

export type RevealMap = Readonly<Record<string, RevealEntry>>;

/** Show one credential's plaintext until `now + REVEAL_MS`. */
export function addReveal(map: RevealMap, credentialId: string, password: string, now: number): RevealMap {
  return { ...map, [credentialId]: { password, expiresAt: now + REVEAL_MS } };
}

/** Hide one credential's plaintext. Returns the same map when nothing changes. */
export function hideReveal(map: RevealMap, credentialId: string): RevealMap {
  if (!(credentialId in map)) return map;
  const next = { ...map };
  delete next[credentialId];
  return next;
}

/** Drop expired entries. Returns the same map when nothing expired. */
export function pruneReveals(map: RevealMap, now: number): RevealMap {
  const ids = Object.keys(map);
  const live = ids.filter((id) => map[id].expiresAt > now);
  if (live.length === ids.length) return map;
  const next: Record<string, RevealEntry> = {};
  for (const id of live) next[id] = map[id];
  return next;
}

/** Milliseconds until the next entry expires, or null when nothing is revealed. */
export function msUntilNextExpiry(map: RevealMap, now: number): number | null {
  let soonest: number | null = null;
  for (const entry of Object.values(map)) {
    if (soonest === null || entry.expiresAt < soonest) soonest = entry.expiresAt;
  }
  return soonest === null ? null : Math.max(0, soonest - now);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/** R9.5: keep credentials whose origin or username contains the search text (case-insensitive). */
export function filterCredentials(list: readonly CredentialListItem[], query: string): CredentialListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  return list.filter((c) => c.origin.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
}

/** Origin without the scheme, for display. */
export function displayOrigin(origin: string): string {
  return origin.replace(/^https?:\/\//i, '');
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: VERIFICATION_FAILED_MESSAGE,
  failed: VERIFICATION_FAILED_MESSAGE,
  'encryption-unavailable': ENCRYPTION_UNAVAILABLE_MESSAGE,
  'vault-corrupt': 'The password vault file is unreadable and was not changed.',
  'invalid-origin': 'Passwords can only be saved for http and https sites.',
  'not-found': 'That saved password no longer exists.',
  unreadable: 'That saved password cannot be decrypted.',
  'invalid-input': 'The request was not valid.',
  expired: 'This request has expired. Try again.',
  forbidden: 'Not allowed.',
  'csv-empty': 'The file has no rows.',
  'csv-missing-columns': 'The file is missing the url, username or password column.',
  'file-too-large': 'That file is too large to import.',
  'read-failed': 'The file could not be read.',
  unavailable: 'Passwords are not available in this window.',
};

const GENERIC_ERROR = 'Something went wrong. Try again.';

/**
 * Map an error code (or verify status) to the message shown in Settings.
 * Unknown codes use `fallback` (the main process message) when given.
 */
export function describePasswordError(code: string | undefined, fallback?: string): string {
  return (code && ERROR_MESSAGES[code]) || fallback || GENERIC_ERROR;
}

const NOT_POSSIBLE_MESSAGES: Record<NotPossibleCause, string> = {
  'unsupported-platform': 'Direct import from Chrome or Edge is only available on Windows.',
  'no-browser-data': 'No Chrome or Edge passwords were found on this computer.',
  'key-unavailable': 'The Chrome or Edge password key could not be read.',
  'app-bound': 'Chrome and Edge protect these passwords with app-bound encryption.',
  'decrypt-failed': 'The Chrome or Edge passwords could not be decrypted.',
  'read-failed': 'The Chrome or Edge password data could not be read.',
};

/** R11.7: why direct import failed, followed by the CSV fallback. */
export function notPossibleMessage(cause: NotPossibleCause | string): string {
  const why = NOT_POSSIBLE_MESSAGES[cause as NotPossibleCause] ?? 'The browser data could not be read.';
  return `Direct import is not possible. ${why} Export a CSV from that browser and import the file instead.`;
}

export const CSV_STEP_BROWSERS: ReadonlyArray<{ key: keyof CsvExportSteps; label: string }> = [
  { key: 'chrome', label: 'Chrome' },
  { key: 'edge', label: 'Edge' },
];

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Counts of a prepared import, before the user resolves conflicts. */
export function prepareSummaryText(counts: {
  imported: number;
  duplicate: number;
  conflict: number;
  invalid: number;
}): string {
  const parts = [
    `${plural(counts.imported, 'new password', 'new passwords')}`,
    `${counts.duplicate} skipped as duplicates`,
    `${counts.invalid} rejected as invalid`,
  ];
  if (counts.conflict > 0) parts.push(plural(counts.conflict, 'conflict to resolve', 'conflicts to resolve'));
  return `Found ${parts.join(', ')}.`;
}

/** R11.2: final counts after commit. Replacements count as imported. */
export function importSummaryText(result: Extract<CommitImportResult, { ok: true }>): string {
  const imported = result.imported + result.replaced;
  let text = `Imported ${plural(imported, 'password', 'passwords')}, skipped ${result.duplicate} as duplicates, rejected ${result.invalid} as invalid.`;
  if (result.kept > 0) text += ` Kept the current password for ${plural(result.kept, 'conflict', 'conflicts')}.`;
  return text;
}

/** Default every conflict to "keep" (the safe choice), preserving any decisions already made. */
export function defaultConflictChoices(
  conflicts: readonly ImportConflictInfo[],
  current: Readonly<Record<number, ConflictChoice>> = {},
): Record<number, ConflictChoice> {
  const out: Record<number, ConflictChoice> = {};
  for (const c of conflicts) out[c.index] = current[c.index] ?? 'keep';
  return out;
}
