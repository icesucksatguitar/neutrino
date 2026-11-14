/**
 * Page password preload (R6.1, R8.1, R8.2, R8.3, R8.6).
 *
 * Injected into page webviews (and their subframes, via
 * `nodeIntegrationInSubFrames`) by the `will-attach-webview` handler added in
 * task 10.11. It runs in the isolated world (`contextIsolation` on) and:
 * - detects login submissions (form `submit`, plus best-effort trusted clicks
 *   on submit-like buttons and Enter in a password field for fetch-only logins)
 *   and sends `{ frameOrigin, username, password }` to main;
 * - on focus of a login field asks main for the usernames saved for this
 *   frame's origin and shows them in a closed shadow root;
 * - fills the username and password fields only after a trusted user click on
 *   a suggestion, by requesting a fill token and redeeming it.
 *
 * Nothing is exposed through `contextBridge` or window globals. The password
 * reaches the page only as the value of the filled password input (R8.6).
 *
 * This file must not import local modules at runtime: a sandboxed preload can
 * only `require('electron')`. `PasswordChannel` is a const enum, inlined by tsc.
 */
import type { IpcRenderer } from 'electron';
import {
  PasswordChannel,
  type CapturePayload,
  type FillTokenPayload,
  type RedeemFillPayload,
  type SuggestionsPayload,
} from './channels';

// ---------------------------------------------------------------------------
// Pure helpers (unit tested, no DOM)
// ---------------------------------------------------------------------------

/** True for an `http:` or `https:` origin/URL with a host. `"null"` and other schemes are false. */
export function isHttpOrigin(origin: string): boolean {
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return false;
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.host !== '';
  } catch {
    return false;
  }
}

/** The facts about an `<input>` the field heuristics need. */
export interface FieldInfo {
  /** Lowercased `type` attribute; '' when absent (treated as text). */
  type: string;
  /** Lowercased `autocomplete` attribute tokens joined by spaces. */
  autocomplete: string;
  visible: boolean;
  /** Whether the field currently has a non-empty value. */
  hasValue: boolean;
}

const USERNAME_TYPES = new Set(['', 'text', 'email', 'tel']);

function autocompleteHas(info: FieldInfo, token: string): boolean {
  return info.autocomplete.split(/\s+/).includes(token);
}

/** A field that could hold a username: text/email/tel, not a one-time code. */
export function isUsernameCandidate(info: FieldInfo): boolean {
  if (autocompleteHas(info, 'one-time-code')) return false;
  if (autocompleteHas(info, 'username')) return info.type !== 'password';
  return USERNAME_TYPES.has(info.type);
}

/**
 * Index of the username field for the password field at `passwordIndex`, in a
 * list of the scope's inputs in document order, or -1.
 * Preference: the nearest field marked `autocomplete="username"` (any position,
 * hidden allowed, for multi-step logins); else the nearest visible candidate
 * before the password field; else the nearest candidate before it.
 */
export function pickUsernameIndex(fields: readonly FieldInfo[], passwordIndex: number): number {
  if (passwordIndex < 0 || passwordIndex >= fields.length) return -1;
  let best = -1;
  let bestDist = Infinity;
  fields.forEach((f, i) => {
    if (i === passwordIndex || f.type === 'password') return;
    if (!autocompleteHas(f, 'username')) return;
    const dist = Math.abs(i - passwordIndex);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  if (best !== -1) return best;
  for (let i = passwordIndex - 1; i >= 0; i--) {
    const f = fields[i];
    if (f.type === 'password') break; // stop at a previous password field
    if (f.visible && isUsernameCandidate(f)) return i;
  }
  for (let i = passwordIndex - 1; i >= 0; i--) {
    const f = fields[i];
    if (f.type === 'password') break;
    if (f.type !== 'hidden' && isUsernameCandidate(f)) return i;
  }
  return -1;
}

/**
 * Index of the password field whose value should be captured, or -1 when no
 * password field has a value. A field marked `new-password` wins (sign-up and
 * change-password forms); otherwise the first password field with a value.
 */
export function pickCapturePasswordIndex(fields: readonly FieldInfo[]): number {
  let first = -1;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.type !== 'password' || !f.hasValue) continue;
    if (autocompleteHas(f, 'new-password')) return i;
    if (first === -1) first = i;
  }
  return first;
}

/** The facts about a clicked element the submit-button heuristic needs. */
export interface ButtonInfo {
  /** Lowercased tag name. */
  tag: string;
  /** Lowercased `type` attribute; '' when absent. */
  type: string;
  /** Lowercased `role` attribute; '' when absent. */
  role: string;
  /** Visible text, `value` or `aria-label`. */
  label: string;
  inForm: boolean;
}

const SUBMIT_LABEL =
  /\b(log ?in|sign ?in|log ?on|sign ?on|continue|next|submit|enter|anmelden|connexion|iniciar sesi[oó]n|accedi)\b/i;

/** Best-effort: does a click on this element look like submitting a login? */
export function isSubmitLike(b: ButtonInfo): boolean {
  if (b.tag === 'input') return b.type === 'submit' || b.type === 'image';
  if (b.tag === 'button') {
    if (b.type === 'submit' || (b.type === '' && b.inForm)) return true;
    if (b.type === 'reset') return false;
    return SUBMIT_LABEL.test(b.label);
  }
  if (b.role === 'button' || b.tag === 'a') return SUBMIT_LABEL.test(b.label);
  return false;
}

/** Window in which a repeat of the same capture (click then submit) is dropped. */
export const CAPTURE_DEDUPE_MS = 2000;

export interface LastCapture {
  key: string;
  at: number;
}

/** False when the same capture was already sent within `CAPTURE_DEDUPE_MS`. */
export function shouldSendCapture(last: LastCapture | null, key: string, now: number): boolean {
  return !(last && last.key === key && now - last.at < CAPTURE_DEDUPE_MS);
}

// ---------------------------------------------------------------------------
// DOM layer
// ---------------------------------------------------------------------------

/** The IPC surface the preload uses (a subset of `ipcRenderer`). */
export type PreloadIpc = Pick<IpcRenderer, 'send' | 'invoke'>;

interface SuggestionItem {
  credentialId: string;
  username: string;
}

function isInput(el: unknown): el is HTMLInputElement {
  return typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement;
}

function infoOf(el: HTMLInputElement): FieldInfo {
  const rects = el.getClientRects();
  return {
    type: (el.getAttribute('type') ?? '').trim().toLowerCase(),
    autocomplete: (el.getAttribute('autocomplete') ?? '').trim().toLowerCase(),
    visible: rects.length > 0 && el.type !== 'hidden',
    hasValue: el.value !== '',
  };
}

/** Inputs in the same form as `el`, or in the document when `el` has no form. */
function scopeInputs(el: Element): HTMLInputElement[] {
  const form = isInput(el) ? el.form : el.closest('form');
  const list = form ? Array.from(form.elements) : Array.from(el.ownerDocument.querySelectorAll('input'));
  return list.filter(isInput);
}

/** The username field for a password field, or null. */
export function findUsernameField(password: HTMLInputElement): HTMLInputElement | null {
  const inputs = scopeInputs(password);
  const idx = pickUsernameIndex(inputs.map(infoOf), inputs.indexOf(password));
  return idx === -1 ? null : inputs[idx];
}

/** For a focused field, the password field of its login form, or null if it is not a login field. */
function loginPasswordFor(el: HTMLInputElement): HTMLInputElement | null {
  if (el.type === 'password') return el;
  const inputs = scopeInputs(el);
  for (const p of inputs) {
    if (p.type === 'password' && findUsernameField(p) === el) return p;
  }
  return null;
}

function buttonInfo(el: Element): ButtonInfo {
  const tag = el.tagName.toLowerCase();
  const label =
    (isInput(el) ? el.value : '') || el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 80);
  return {
    tag,
    type: (el.getAttribute('type') ?? '').trim().toLowerCase(),
    role: (el.getAttribute('role') ?? '').trim().toLowerCase(),
    label,
    inForm: el.closest('form') !== null,
  };
}

function setFieldValue(el: HTMLInputElement, value: string): void {
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function isSuggestionList(v: unknown): v is SuggestionItem[] {
  return (
    Array.isArray(v) &&
    v.every(
      (s) => s !== null && typeof s === 'object' && typeof s.credentialId === 'string' && typeof s.username === 'string',
    )
  );
}

const LIST_CSS = `
:host { all: initial; }
.list { font: 13px system-ui, sans-serif; color: #1f1f1f; background: #fff; border: 1px solid #c8c8c8;
  border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.18); padding: 4px 0; max-height: 220px; overflow-y: auto; }
.title { padding: 4px 10px; font-size: 11px; color: #666; }
button { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 6px 10px; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button:hover, button:focus { background: #e8f0fe; }
`;

/**
 * Wire the listeners into `doc`. Returns a disposer (used by tests and on
 * unload). `doc.defaultView.location.origin` is the frame origin.
 */
export function installPasswordPreload(doc: Document, ipc: PreloadIpc): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};
  const frameOrigin = (): string => win.location.origin;
  let lastCapture: LastCapture | null = null;

  // ----- capture (R6.1) -----------------------------------------------------

  function captureFrom(anchor: Element): void {
    const origin = frameOrigin();
    if (!isHttpOrigin(origin)) return;
    const inputs = scopeInputs(anchor);
    const pwIdx = pickCapturePasswordIndex(inputs.map(infoOf));
    if (pwIdx === -1) return;
    const password = inputs[pwIdx];
    const user = findUsernameField(password);
    const payload: CapturePayload = { frameOrigin: origin, username: user?.value ?? '', password: password.value };
    const key = `${payload.username}\u0000${payload.password}`;
    const now = Date.now();
    if (!shouldSendCapture(lastCapture, key, now)) return;
    lastCapture = { key, at: now };
    ipc.send(PasswordChannel.Capture, payload);
  }

  const onSubmit = (e: Event): void => {
    if (e.target instanceof win.HTMLFormElement) captureFrom(e.target);
  };

  const onClick = (e: MouseEvent): void => {
    if (!e.isTrusted) return;
    for (const node of e.composedPath()) {
      if (!(node instanceof win.Element)) continue;
      if (node === host) return; // our own suggestion list
      const tag = node.tagName.toLowerCase();
      if (tag === 'button' || tag === 'input' || tag === 'a' || node.getAttribute('role') === 'button') {
        if (isSubmitLike(buttonInfo(node))) captureFrom(node);
        return;
      }
    }
  };

  const onKeydown = (e: KeyboardEvent): void => {
    if (!e.isTrusted) return;
    if (e.key === 'Escape') {
      hideList();
      return;
    }
    if (e.key === 'Enter' && isInput(e.target) && e.target.type === 'password' && !e.target.form) {
      captureFrom(e.target); // formless (fetch-only) login
    }
  };

  // ----- suggestions and fill (R8.1, R8.2, R8.3, R8.6) ----------------------

  let host: HTMLElement | null = null;
  let requestSeq = 0;

  function hideList(): void {
    requestSeq++;
    host?.remove();
    host = null;
  }

  async function fill(field: HTMLInputElement, credentialId: string): Promise<void> {
    const origin = frameOrigin();
    if (!isHttpOrigin(origin)) return;
    const tokenReq: FillTokenPayload = { frameOrigin: origin, credentialId };
    const tok = (await ipc.invoke(PasswordChannel.FillToken, tokenReq)) as { ok?: unknown; token?: unknown } | null;
    if (!tok || tok.ok !== true || typeof tok.token !== 'string') return;
    const redeemReq: RedeemFillPayload = { frameOrigin: origin, token: tok.token };
    const cred = (await ipc.invoke(PasswordChannel.RedeemFill, redeemReq)) as {
      ok?: unknown;
      username?: unknown;
      password?: unknown;
    } | null;
    if (!cred || cred.ok !== true || typeof cred.username !== 'string' || typeof cred.password !== 'string') return;
    // Re-resolve the fields: the page may have re-rendered while we waited.
    const password = field.isConnected ? loginPasswordFor(field) : null;
    if (!password) return;
    const user = findUsernameField(password);
    if (user) setFieldValue(user, cred.username);
    setFieldValue(password, cred.password);
  }

  function showList(field: HTMLInputElement, items: SuggestionItem[]): void {
    hideList();
    const rect = field.getBoundingClientRect();
    const el = doc.createElement('neutrino-password-suggestions');
    el.setAttribute(
      'style',
      `all: initial; position: fixed; z-index: 2147483647; left: ${Math.round(rect.left)}px; ` +
        `top: ${Math.round(rect.bottom + 2)}px; min-width: ${Math.max(180, Math.round(rect.width))}px;`,
    );
    const root = el.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = LIST_CSS;
    const list = doc.createElement('div');
    list.className = 'list';
    const title = doc.createElement('div');
    title.className = 'title';
    title.textContent = 'Saved logins';
    list.appendChild(title);
    for (const item of items) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = item.username || '(no username)';
      // Keep focus in the page field so blur does not close the list first.
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => {
        // Fill only on a genuine user action, never on a page-dispatched event.
        if (!e.isTrusted) return;
        e.preventDefault();
        e.stopPropagation();
        hideList();
        void fill(field, item.credentialId).catch(() => {});
      });
      list.appendChild(b);
    }
    root.append(style, list);
    (doc.body ?? doc.documentElement).appendChild(el);
    host = el;
  }

  const onFocusIn = (e: FocusEvent): void => {
    if (!e.isTrusted) return;
    const field = e.target;
    if (!isInput(field) || field.readOnly || field.disabled) return;
    const origin = frameOrigin();
    if (!isHttpOrigin(origin) || !loginPasswordFor(field)) return;
    const seq = ++requestSeq;
    const req: SuggestionsPayload = { frameOrigin: origin };
    ipc
      .invoke(PasswordChannel.Suggestions, req)
      .then((res) => {
        if (seq !== requestSeq || doc.activeElement !== field) return;
        if (isSuggestionList(res) && res.length > 0) showList(field, res);
      })
      .catch(() => {});
  };

  const onFocusOut = (e: FocusEvent): void => {
    if (host && e.target !== host) hideList();
  };

  const onViewportChange = (): void => {
    if (host) hideList();
  };

  doc.addEventListener('submit', onSubmit, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeydown, true);
  doc.addEventListener('focusin', onFocusIn, true);
  doc.addEventListener('focusout', onFocusOut, true);
  win.addEventListener('resize', onViewportChange);
  win.addEventListener('scroll', onViewportChange, true);

  return () => {
    hideList();
    doc.removeEventListener('submit', onSubmit, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeydown, true);
    doc.removeEventListener('focusin', onFocusIn, true);
    doc.removeEventListener('focusout', onFocusOut, true);
    win.removeEventListener('resize', onViewportChange);
    win.removeEventListener('scroll', onViewportChange, true);
  };
}

// Auto-start only inside an Electron renderer frame; importing this module in
// tests (Node) has no side effects.
if (
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof process !== 'undefined' &&
  (process as { type?: string }).type === 'renderer'
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ipcRenderer } = require('electron') as typeof import('electron');
  installPasswordPreload(document, ipcRenderer);
}
