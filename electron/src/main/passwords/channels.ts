/**
 * IPC channel names shared by the page password preload (`passwordPreload.ts`)
 * and the main-process handlers (task 10.11).
 *
 * This is a `const enum` on purpose: `tsc` inlines the string values and drops
 * the import, so the compiled preload has no `require('./channels')`. Webview
 * preloads may run sandboxed, where requiring local files is not allowed.
 *
 * Payloads (all from the page frame; main must take the frame identity and
 * origin from `event.senderFrame`, never trust `frameOrigin` alone):
 * - Capture      (send)   { frameOrigin, username, password }
 * - Suggestions  (invoke) { frameOrigin } -> Array<{ credentialId, username }>
 * - FillToken    (invoke) { frameOrigin, credentialId } -> { ok: true, token } | PasswordError
 * - RedeemFill   (invoke) { frameOrigin, token } -> { ok: true, username, password } | PasswordError
 */
export const enum PasswordChannel {
  Capture = 'neutrino-pw:capture',
  Suggestions = 'neutrino-pw:suggestions',
  FillToken = 'neutrino-pw:fill-token',
  RedeemFill = 'neutrino-pw:redeem-fill',
}

export interface CapturePayload {
  frameOrigin: string;
  username: string;
  password: string;
}

export interface SuggestionsPayload {
  frameOrigin: string;
}

export interface FillTokenPayload {
  frameOrigin: string;
  credentialId: string;
}

export interface RedeemFillPayload {
  frameOrigin: string;
  token: string;
}
