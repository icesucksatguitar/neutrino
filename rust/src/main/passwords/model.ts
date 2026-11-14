// Pure password-manager model: origin normalization, capture decisions,
// never-list helpers, autofill suggestions and the plaintext-free list DTO.
// No Electron imports so every function here is unit/property testable.

/** A decrypted credential as seen inside the Main_Process. */
export interface CredView {
  id: string;
  /** Normalized origin (scheme://host[:port]). Normalized again defensively on compare. */
  origin: string;
  username: string;
  /** Decrypted password. Absent when the stored blob could not be decrypted. */
  password?: string;
  /** True when the stored blob failed to decrypt (R7.3). */
  unreadable?: boolean;
  createdAt: number;
  lastUsedAt: number;
}

/** A login-form submission captured from a page frame. */
export interface Capture {
  /** Frame URL or origin the form was submitted from. */
  origin: string;
  username: string;
  password: string;
}

export type CaptureDecision = 'save' | 'update' | 'touch' | 'suppress';

/** What the Settings list receives: never any password plaintext (R9.1). */
export interface CredentialListItem {
  id: string;
  origin: string;
  username: string;
  createdAt: number;
  lastUsedAt: number;
  unreadable: boolean;
}

/**
 * Normalize a URL or origin to `scheme://host[:port]`, lowercased, with default
 * ports dropped. Returns null for anything that is not a valid http(s) URL.
 */
export function normalizeOrigin(url: string): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== 'http:' && scheme !== 'https:') return null;
  // URL already lowercases the host and drops the scheme's default port.
  const host = parsed.host.toLowerCase();
  if (host === '') return null;
  return `${scheme}//${host}`;
}

/** True when `origin` is on the never-list (compared by normalized origin). */
export function isNeverListed(neverList: readonly string[], origin: string): boolean {
  const n = normalizeOrigin(origin);
  if (n === null) return false;
  return neverList.some((entry) => normalizeOrigin(entry) === n);
}

/**
 * Decide what to do with a captured submission (R6.2–6.4, 6.8):
 * - `suppress` when the origin is on the never-list (or is not http(s));
 * - `touch` when origin+username+password all match a credential;
 * - `update` when origin+username match but the password differs
 *   (an unreadable credential cannot be confirmed equal, so it is offered for update);
 * - `save` otherwise.
 */
export function decideCapture(
  vault: readonly CredView[],
  neverList: readonly string[],
  cap: Capture,
): CaptureDecision {
  const origin = normalizeOrigin(cap.origin);
  if (origin === null) return 'suppress';
  if (isNeverListed(neverList, origin)) return 'suppress';
  const sameUser = vault.filter(
    (c) => c.username === cap.username && normalizeOrigin(c.origin) === origin,
  );
  if (sameUser.length === 0) return 'save';
  if (sameUser.some((c) => !c.unreadable && c.password === cap.password)) return 'touch';
  return 'update';
}

/**
 * Add an origin to the never-list (R6.7). Returns a new list; the stored entry is
 * the normalized origin and duplicates are not added. Non-http(s) input is ignored.
 */
export function addToNeverList(neverList: readonly string[], origin: string): string[] {
  const n = normalizeOrigin(origin);
  if (n === null || isNeverListed(neverList, n)) return [...neverList];
  return [...neverList, n];
}

/** Remove an origin from the never-list (R6.9). Returns a new list. */
export function removeFromNeverList(neverList: readonly string[], origin: string): string[] {
  const n = normalizeOrigin(origin);
  if (n === null) return [...neverList];
  return neverList.filter((entry) => normalizeOrigin(entry) !== n);
}

/**
 * Autofill candidates for a frame (R8.1, 8.4, 8.5). The caller passes only the
 * vault of the profile that owns the tab. Matching is exact normalized-origin
 * equality (scheme, host and port), so an https-saved credential is never offered
 * to an http frame. Unreadable credentials are excluded.
 */
export function suggestionsFor(vault: readonly CredView[], frameOrigin: string): CredView[] {
  const frame = normalizeOrigin(frameOrigin);
  if (frame === null) return [];
  return vault.filter((c) => !c.unreadable && normalizeOrigin(c.origin) === frame);
}

/** Map credentials to the plaintext-free Settings list DTO (R9.1). */
export function toListDto(vault: readonly CredView[]): CredentialListItem[] {
  return vault.map((c) => ({
    id: c.id,
    origin: c.origin,
    username: c.username,
    createdAt: c.createdAt,
    lastUsedAt: c.lastUsedAt,
    unreadable: c.unreadable === true,
  }));
}

/**
 * Case-insensitive substring filter on origin or username (R9.5). An empty query
 * matches everything.
 */
export function filterCredentials<T extends { origin: string; username: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const q = query.toLowerCase();
  return items.filter(
    (c) => c.origin.toLowerCase().includes(q) || c.username.toLowerCase().includes(q),
  );
}
