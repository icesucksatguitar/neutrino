// Google sign-in handling: classification and the external-browser handoff.
// Pure module (no Electron import) so it can be unit tested; src/main/authHandoff.ts wires it to
// webContents events and IPC.
//
// Why a handoff and not a workaround: Google's OAuth policies do not allow authorization requests
// from embedded browsers and webviews, and Google's sign-in can refuse browsers it cannot verify
// ("This browser or app may not be secure", or Error 400 disallowed_useragent). Neutrino reports
// its real identity and lets Google decide. When Google refuses, the sign-in is continued in the
// user's default browser, which Google supports.
//
// The handoff never re-opens the OAuth authorization URL or a callback URL. Those carry a `state`
// value (and often a PKCE verifier or nonce) bound to cookies or storage in Neutrino's session,
// which the system browser does not have, so the callback would fail validation there. Instead the
// handoff opens the page the user started from, so the whole sign-in runs again inside one browser.
// The user ends up signed in to that site in the system browser, not in Neutrino; the UI says so.
//
// Only accounts.google.com is matched, by exact hostname, so other identity providers (Apple,
// GitHub, Microsoft, Auth0 and so on) are never affected.

export const GOOGLE_ACCOUNTS_HOST = 'accounts.google.com';

export type GoogleAuthRejectionReason = 'browser-not-secure' | 'disallowed-useragent';

/** Where the handoff URL came from, from most to least specific. */
export type HandoffTargetSource = 'origin' | 'redirect-origin' | 'google-continue' | 'google-signin';

export interface HandoffTarget {
  url: string;
  source: HandoffTargetSource;
}

export interface HandoffRequest {
  handoffId: string;
  provider: 'google';
  reason: GoogleAuthRejectionReason;
  /** webContents where Google refused the sign-in (a tab webview or a popup). */
  sourceId: number;
  /** True when the refusal happened in a popup opened by a site. */
  isPopup: boolean;
  /** webContents of the tab the user started from (the opener for popups, else sourceId). */
  ownerId: number;
  targetUrl: string;
  targetSource: HandoffTargetSource;
  /** Hostname shown to the user, e.g. "chatgpt.com". */
  siteHost: string;
}

/** Query parameters that mark a URL as part of an OAuth/OIDC exchange and so unsafe to replay. */
const OAUTH_PARAMS = [
  'code',
  'state',
  'client_id',
  'redirect_uri',
  'response_type',
  'id_token',
  'access_token',
  'oauth_token',
  'oauth_verifier',
  'code_challenge',
  'nonce',
];

function parseHttpUrl(url: string | undefined | null): URL | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

export function isGoogleAccountsUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  return !!parsed && parsed.protocol === 'https:' && parsed.hostname === GOOGLE_ACCOUNTS_HOST;
}

/** True for Google OAuth / Google Identity Services authorization requests started by a website. */
export function isGoogleOAuthRequest(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== GOOGLE_ACCOUNTS_HOST) return false;
  const path = parsed.pathname;
  if (path.startsWith('/o/oauth2/') || path.startsWith('/signin/oauth') || path.startsWith('/gsi/')) {
    return true;
  }
  // The v3 sign-in pages carry the OAuth request in their query or in `continue`.
  if (path.startsWith('/v3/signin/') || path.startsWith('/ServiceLogin') || path.startsWith('/AccountChooser')) {
    if (parsed.searchParams.has('client_id')) return true;
    const cont = parsed.searchParams.get('continue') || '';
    return cont.includes('accounts.google.com/o/oauth2') || cont.includes('accounts.google.com/signin/oauth');
  }
  return false;
}

function decodeBase64Url(value: string): string {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    if (typeof atob === 'function') return atob(padded);
    return Buffer.from(padded, 'base64').toString('latin1');
  } catch {
    return '';
  }
}

/**
 * Detects Google's refusal pages:
 * - "This browser or app may not be secure": accounts.google.com/(v3/)signin/(v2/)rejected
 * - OAuth "Error 400: disallowed_useragent": accounts.google.com/signin/oauth/error with an
 *   `authError` protobuf (base64url) naming disallowed_useragent
 * Other OAuth errors (redirect_uri_mismatch and so on) belong to the website and are not handed off.
 */
export function getGoogleAuthRejection(url: string): GoogleAuthRejectionReason | null {
  if (!isGoogleAccountsUrl(url)) return null;
  const parsed = new URL(url);
  const path = parsed.pathname;
  if (/^\/(v3\/)?signin\/(v2\/)?rejected(\/|$)/.test(path)) {
    return 'browser-not-secure';
  }
  if (path.startsWith('/signin/oauth/error')) {
    const authError = parsed.searchParams.get('authError') || '';
    if (authError.includes('disallowed_useragent') || decodeBase64Url(authError).includes('disallowed_useragent')) {
      return 'disallowed-useragent';
    }
  }
  return null;
}

/** A page that can be reopened in another browser without replaying part of an OAuth exchange. */
export function isSafeHandoffOrigin(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.hostname === GOOGLE_ACCOUNTS_HOST) return false;
  // Firebase Auth's redirect handler needs the session storage of the browser that started it.
  if (parsed.pathname.includes('/__/auth/')) return false;
  for (const key of OAUTH_PARAMS) {
    if (parsed.searchParams.has(key)) return false;
  }
  const hash = parsed.hash.replace(/^#/, '');
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    for (const key of OAUTH_PARAMS) {
      if (hashParams.has(key)) return false;
    }
  }
  return true;
}

/** http(s) URL with no embedded credentials: the only kind ever passed to the system browser. */
export function isOpenableExternalUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  return !!parsed && !parsed.username && !parsed.password;
}

/** Turns a redirect_uri (including GIS `storagerelay://https/host?id=` values) into a site origin. */
function redirectUriOrigin(value: string | null): string | null {
  if (!value) return null;
  let candidate = value;
  const relay = /^storagerelay:\/\/(https?)\/([^/?#]+)/i.exec(value);
  if (relay) candidate = `${relay[1].toLowerCase()}://${relay[2]}`;
  const parsed = parseHttpUrl(candidate);
  if (!parsed || parsed.hostname === GOOGLE_ACCOUNTS_HOST) return null;
  return parsed.origin + '/';
}

function findRedirectOrigin(authUrl: URL, depth = 0): string | null {
  const direct =
    redirectUriOrigin(authUrl.searchParams.get('redirect_uri')) ||
    redirectUriOrigin(authUrl.searchParams.get('origin'));
  if (direct) return direct;
  const cont = parseHttpUrl(authUrl.searchParams.get('continue'));
  if (cont && depth < 2 && cont.hostname === GOOGLE_ACCOUNTS_HOST) return findRedirectOrigin(cont, depth + 1);
  return null;
}

function isGoogleOwnedHost(host: string): boolean {
  return hostIs(host, 'google.com') || hostIs(host, 'youtube.com');
}

/**
 * Chooses the URL to continue in the system browser.
 * 1. The page the user started from (popup opener or the tab's last regular page), if it is safe.
 * 2. The origin of the OAuth redirect_uri (the site's home page, never the callback itself).
 * 3. For Google's own sign-in, the Google page it would have continued to.
 * 4. Google's sign-in page.
 */
export function resolveHandoffTarget(input: { originUrl?: string | null; authUrl?: string | null }): HandoffTarget | null {
  if (input.originUrl && isSafeHandoffOrigin(input.originUrl)) {
    return { url: input.originUrl, source: 'origin' };
  }
  const auth = input.authUrl && isGoogleAccountsUrl(input.authUrl) ? new URL(input.authUrl) : null;
  if (!auth) return null;

  const redirectOrigin = findRedirectOrigin(auth);
  if (redirectOrigin) return { url: redirectOrigin, source: 'redirect-origin' };

  if (!isGoogleOAuthRequest(auth.toString())) {
    const cont = parseHttpUrl(auth.searchParams.get('continue'));
    if (cont && cont.protocol === 'https:' && cont.hostname !== GOOGLE_ACCOUNTS_HOST && isGoogleOwnedHost(cont.hostname)) {
      return { url: cont.toString(), source: 'google-continue' };
    }
  }
  return { url: `https://${GOOGLE_ACCOUNTS_HOST}/`, source: 'google-signin' };
}

interface ContentsRecord {
  /** Last committed page that is safe to reopen elsewhere. */
  lastSafeUrl?: string;
  /** Last Google sign-in URL seen before a refusal (used when no safe origin is known). */
  lastGoogleAuthUrl?: string;
  /** For popups: the webContents that opened it and the page it was opened from. */
  openerId?: number;
  openerUrl?: string;
  /** A handoff already raised for the refusal page currently shown, to avoid duplicates. */
  pendingHandoffId?: string;
}

const MAX_PENDING_HANDOFFS = 20;

/**
 * Tracks navigations per webContents so a Google refusal can be turned into a handoff that knows
 * where the sign-in started. Holds no Electron objects, only ids and URLs.
 */
export class GoogleAuthTracker {
  private records = new Map<number, ContentsRecord>();
  private handoffs = new Map<string, HandoffRequest>();
  private counter = 0;

  constructor(private readonly makeId: () => string = () => `handoff-${Date.now().toString(36)}`) {}

  private record(id: number): ContentsRecord {
    let rec = this.records.get(id);
    if (!rec) {
      rec = {};
      this.records.set(id, rec);
    }
    return rec;
  }

  /** A site opened a popup (window.open). Remember the opener so the handoff returns there. */
  registerPopup(childId: number, openerId: number, openerUrl?: string): void {
    const rec = this.record(childId);
    rec.openerId = openerId;
    if (openerUrl) rec.openerUrl = openerUrl;
  }

  isPopup(id: number): boolean {
    return this.records.get(id)?.openerId !== undefined;
  }

  /**
   * Records a committed main-frame navigation. Returns a new handoff when it lands on a Google
   * refusal page, otherwise null.
   */
  recordNavigation(id: number, url: string): HandoffRequest | null {
    const rec = this.record(id);
    const reason = getGoogleAuthRejection(url);

    if (!reason) {
      rec.pendingHandoffId = undefined;
      if (isGoogleAccountsUrl(url)) {
        rec.lastGoogleAuthUrl = url;
      } else if (isSafeHandoffOrigin(url)) {
        rec.lastSafeUrl = url;
        rec.lastGoogleAuthUrl = undefined;
      }
      return null;
    }

    if (rec.pendingHandoffId && this.handoffs.has(rec.pendingHandoffId)) return null;

    const isPopup = rec.openerId !== undefined;
    const opener = isPopup ? this.records.get(rec.openerId!) : undefined;
    const originUrl = isPopup
      ? [rec.openerUrl, opener?.lastSafeUrl, rec.lastSafeUrl].find((u) => !!u && isSafeHandoffOrigin(u))
      : rec.lastSafeUrl;
    const target = resolveHandoffTarget({ originUrl, authUrl: rec.lastGoogleAuthUrl ?? url });
    if (!target || !isOpenableExternalUrl(target.url)) return null;

    const handoff: HandoffRequest = {
      handoffId: `${this.makeId()}-${++this.counter}`,
      provider: 'google',
      reason,
      sourceId: id,
      isPopup,
      ownerId: isPopup ? rec.openerId! : id,
      targetUrl: target.url,
      targetSource: target.source,
      siteHost: new URL(target.url).hostname,
    };
    rec.pendingHandoffId = handoff.handoffId;
    this.handoffs.set(handoff.handoffId, handoff);
    while (this.handoffs.size > MAX_PENDING_HANDOFFS) {
      const oldest = this.handoffs.keys().next().value as string;
      this.handoffs.delete(oldest);
    }
    return handoff;
  }

  getHandoff(handoffId: unknown): HandoffRequest | null {
    if (typeof handoffId !== 'string') return null;
    return this.handoffs.get(handoffId) ?? null;
  }

  /** Removes a handoff once it was opened or dismissed. Returns it, or null for unknown ids. */
  resolveHandoff(handoffId: unknown): HandoffRequest | null {
    const handoff = this.getHandoff(handoffId);
    if (handoff) this.handoffs.delete(handoff.handoffId);
    return handoff;
  }

  /** The webContents was destroyed (tab closed, popup closed or cancelled by the user). */
  forget(id: number): void {
    this.records.delete(id);
  }
}
