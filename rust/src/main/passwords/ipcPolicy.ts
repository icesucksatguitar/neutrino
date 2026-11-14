// Trust-boundary helpers for the password IPC in index.ts (task 10.11).
// Pure: no Electron imports, so every rule here is unit tested.
//
// Two kinds of sender exist:
// - page webviews (tabs) carry the password preload and may only use the
//   page channels (capture, suggestions, fill token, redeem);
// - the browser UI renderer (main window, top frame) may only use the
//   renderer channels (prompt responses, list, edit, delete, reveal, copy,
//   never-list, import).
// Assistant drawer webviews get no password preload and match neither.
import type { CaptureSource, ConflictChoice, FrameContext, PromptAction } from './manager';
import { normalizeOrigin } from './model';
import { hasAssistantMarker } from './webviewMarker';

const MAX_ID_LENGTH = 200;
/** Generous caps so a hostile frame cannot push megabytes into main memory. */
export const MAX_USERNAME_LENGTH = 1024;
export const MAX_PASSWORD_LENGTH = 4096;
export const MAX_ORIGIN_LENGTH = 2048;
/** Largest CSV file the import reads (Chrome exports are far smaller). */
export const MAX_CSV_BYTES = 10 * 1024 * 1024;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asShortId(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_ID_LENGTH || CONTROL_CHARS.test(v)) return null;
  return v;
}

function asBoundedString(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length <= max ? v : null;
}

// ---------------------------------------------------------------------------
// will-attach-webview
// ---------------------------------------------------------------------------

export type WebviewKind = 'page' | 'assistant';

/**
 * Harden and complete a webview's preferences in place, and say which kind it
 * is. Any preload the renderer asked for is dropped; Node stays off.
 * - page: the password preload, also in subframes (cross-origin iframes, R8.3);
 * - assistant (marker present): no preload at all (bugfix 3.7).
 */
export function applyWebviewPreferences(
  prefs: Record<string, unknown>,
  passwordPreloadPath: string,
): WebviewKind {
  const assistant = hasAssistantMarker(prefs);
  delete prefs.preload;
  delete prefs.preloadURL;
  prefs.nodeIntegration = false;
  prefs.contextIsolation = true;
  if (assistant) {
    prefs.nodeIntegrationInSubFrames = false;
    return 'assistant';
  }
  prefs.preload = passwordPreloadPath;
  prefs.nodeIntegrationInSubFrames = true;
  return 'page';
}

/**
 * Links a `will-attach-webview` decision to the guest webContents created
 * right after it. Electron emits `will-attach-webview` and then creates the
 * guest synchronously (which fires `web-contents-created`), so the last
 * decision belongs to the next webview created. A decision is used once.
 */
export class WebviewKindTracker {
  private pending: WebviewKind | null = null;

  noteWillAttach(kind: WebviewKind): void {
    this.pending = kind;
  }

  /** The attach was cancelled: forget the decision. */
  cancel(): void {
    this.pending = null;
  }

  /** The kind for a newly created webview, or null when none was recorded. */
  takeForNewWebview(): WebviewKind | null {
    const kind = this.pending;
    this.pending = null;
    return kind;
  }
}

/**
 * Whether a new webview is a page webview. The recorded decision wins; only
 * when none exists are the guest's final preferences consulted (our preload,
 * no assistant marker). Unknown means not a page (fail closed).
 */
export function isPageWebviewKind(
  recorded: WebviewKind | null,
  lastPrefs: Record<string, unknown> | null | undefined,
  passwordPreloadPath: string,
): boolean {
  if (recorded !== null) return recorded === 'page';
  if (!lastPrefs) return false;
  return lastPrefs.preload === passwordPreloadPath && !hasAssistantMarker(lastPrefs);
}

// ---------------------------------------------------------------------------
// Sender classification
// ---------------------------------------------------------------------------

export interface SenderInfo {
  /** `event.sender.id`. */
  webContentsId: number;
  /** `event.sender.getType()`. */
  type: string;
  /** `event.sender.hostWebContents?.id` (webviews only). */
  hostWebContentsId: number | null;
  /** Whether `event.senderFrame` is the sender's top frame. */
  isMainFrame: boolean;
}

export interface SenderPolicy {
  /** The main window's webContents id, or null when there is no window. */
  mainWindowWebContentsId: number | null;
  /** Webviews that received the password preload. */
  isPageWebview(webContentsId: number): boolean;
}

export type SenderKind = 'main-ui' | 'page' | 'other';

/**
 * - `main-ui`: the main window's own webContents, top frame only;
 * - `page`: a webview hosted by the main window that got the password preload
 *   (any frame: subframes are checked by origin later);
 * - `other`: everything else (assistant webviews, popups, unknown windows).
 */
export function classifySender(info: SenderInfo, policy: SenderPolicy): SenderKind {
  const main = policy.mainWindowWebContentsId;
  if (main === null) return 'other';
  if (info.webContentsId === main) {
    return info.type === 'window' && info.isMainFrame ? 'main-ui' : 'other';
  }
  if (info.type === 'webview' && info.hostWebContentsId === main && policy.isPageWebview(info.webContentsId)) {
    return 'page';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Frame context for page requests
// ---------------------------------------------------------------------------

/** The parts of `event.senderFrame` the context needs. */
export interface SenderFrameInfo {
  processId: number;
  routingId: number;
  origin: string;
}

/** Stable frame identity used to bind fill tokens. */
export function frameIdOf(frame: Pick<SenderFrameInfo, 'processId' | 'routingId'>): string {
  return `${frame.processId}:${frame.routingId}`;
}

/** The profile whose partition is `partition`, or null. */
export function profileForPartition(
  partition: string | null,
  profileIds: readonly string[],
  partitionOf: (profileId: string) => string,
): string | null {
  if (!partition) return null;
  return profileIds.find((id) => partitionOf(id) === partition) ?? null;
}

/**
 * Build the frame context from the trusted sender frame. The preload's
 * `frameOrigin` is only a hint: it must name the same origin as
 * `senderFrame.origin`, which is what the context uses. Returns null when the
 * frame is gone, not http(s), or the hint disagrees.
 */
export function resolveFrameContext(input: {
  profileId: string | null;
  webContentsId: number;
  senderFrame: SenderFrameInfo | null | undefined;
  hintOrigin: unknown;
}): FrameContext | null {
  const { profileId, senderFrame } = input;
  if (!profileId || !senderFrame) return null;
  const actual = normalizeOrigin(senderFrame.origin);
  if (actual === null) return null;
  if (typeof input.hintOrigin !== 'string' || input.hintOrigin.length > MAX_ORIGIN_LENGTH) return null;
  if (normalizeOrigin(input.hintOrigin) !== actual) return null;
  return {
    profileId,
    webContentsId: input.webContentsId,
    frameId: frameIdOf(senderFrame),
    frameOrigin: actual,
  };
}

/** Narrow a frame context to what `capture` needs. */
export function captureSourceOf(ctx: FrameContext): CaptureSource {
  return { profileId: ctx.profileId, webContentsId: ctx.webContentsId };
}

// ---------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------

export interface ParsedCapture {
  frameOrigin: string;
  username: string;
  password: string;
}

export function parseCapturePayload(v: unknown): ParsedCapture | null {
  if (!isRecord(v)) return null;
  const frameOrigin = asBoundedString(v.frameOrigin, MAX_ORIGIN_LENGTH);
  const username = asBoundedString(v.username, MAX_USERNAME_LENGTH);
  const password = asBoundedString(v.password, MAX_PASSWORD_LENGTH);
  if (frameOrigin === null || username === null || password === null || password === '') return null;
  return { frameOrigin, username, password };
}

/** `{ frameOrigin, <key> }` payloads (suggestions, fill token, redeem). */
export function parseFramePayload<K extends string>(
  v: unknown,
  key?: K,
): ({ frameOrigin: string } & { [P in K]: string }) | null {
  if (!isRecord(v)) return null;
  const frameOrigin = asBoundedString(v.frameOrigin, MAX_ORIGIN_LENGTH);
  if (frameOrigin === null) return null;
  if (key === undefined) return { frameOrigin } as { frameOrigin: string } & { [P in K]: string };
  const id = asShortId(v[key]);
  if (id === null) return null;
  return { frameOrigin, [key]: id } as { frameOrigin: string } & { [P in K]: string };
}

const PROMPT_ACTIONS: readonly PromptAction[] = ['save', 'update', 'never', 'not-now', 'dismiss'];

export function parsePromptResponse(v: unknown): { promptId: string; action: PromptAction } | null {
  if (!isRecord(v)) return null;
  const promptId = asShortId(v.promptId);
  const action = v.action;
  if (!promptId || typeof action !== 'string' || !(PROMPT_ACTIONS as readonly string[]).includes(action)) return null;
  return { promptId, action: action as PromptAction };
}

export function parseCredentialId(v: unknown): string | null {
  return asShortId(v);
}

export function parseEditPayload(
  v: unknown,
): { credentialId: string; patch: { username?: string; password?: string } } | null {
  if (!isRecord(v)) return null;
  const credentialId = asShortId(v.credentialId);
  if (!credentialId) return null;
  const patch: { username?: string; password?: string } = {};
  if (v.username !== undefined) {
    const u = asBoundedString(v.username, MAX_USERNAME_LENGTH);
    if (u === null) return null;
    patch.username = u;
  }
  if (v.password !== undefined) {
    const p = asBoundedString(v.password, MAX_PASSWORD_LENGTH);
    if (p === null || p === '') return null;
    patch.password = p;
  }
  if (patch.username === undefined && patch.password === undefined) return null;
  return { credentialId, patch };
}

export function parseConfirmPayload(v: unknown): { confirmId: string; accepted: boolean } | null {
  if (!isRecord(v)) return null;
  const confirmId = asShortId(v.confirmId);
  if (!confirmId || typeof v.accepted !== 'boolean') return null;
  return { confirmId, accepted: v.accepted };
}

export function parseOrigin(v: unknown): string | null {
  const s = asBoundedString(v, MAX_ORIGIN_LENGTH);
  return s === null ? null : normalizeOrigin(s);
}

/** `{ importId, choices: { [index]: 'keep' | 'replace' } }`; unknown or bad entries are dropped. */
export function parseCommitPayload(
  v: unknown,
): { importId: string; choices: Record<number, ConflictChoice> } | null {
  if (!isRecord(v)) return null;
  const importId = asShortId(v.importId);
  if (!importId) return null;
  const choices: Record<number, ConflictChoice> = {};
  if (v.choices !== undefined) {
    if (!isRecord(v.choices)) return null;
    for (const [k, c] of Object.entries(v.choices)) {
      const index = Number(k);
      if (!Number.isInteger(index) || index < 0 || String(index) !== k) continue;
      if (c === 'keep' || c === 'replace') choices[index] = c;
    }
  }
  return { importId, choices };
}
