/**
 * Marker that tells the main process a `<webview>` belongs to the assistant
 * (MCP) drawer, so the `will-attach-webview` handler gives it no password
 * preload (bugfix 3.7, design "Capture and autofill transport").
 *
 * Shared by the main process (`index.ts`, `ipcPolicy.ts`) and the renderer
 * (`McpModal.tsx`, task 12.8). Keep this file free of imports so both builds
 * can use it.
 *
 * Electron parses a webview's `webpreferences` attribute ("a=yes,b=no") into
 * the object passed to `will-attach-webview`, converting "yes" to `true`, so
 * the marker arrives as `webPreferences.neutrinoAssistantWebview === true`.
 */
export const ASSISTANT_WEBVIEW_MARKER_KEY = 'neutrinoAssistantWebview';

/** The `key=value` pair to put in an assistant webview's `webpreferences` string. */
export const ASSISTANT_WEBVIEW_MARKER = `${ASSISTANT_WEBVIEW_MARKER_KEY}=yes`;

/** Append the assistant marker to a `webpreferences` string (idempotent). */
export function withAssistantMarker(webpreferences: string): string {
  const parts = webpreferences
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.some((p) => p.split('=')[0].trim() === ASSISTANT_WEBVIEW_MARKER_KEY)) return parts.join(',');
  return [...parts, ASSISTANT_WEBVIEW_MARKER].join(',');
}

/** True when parsed webPreferences carry the assistant marker. */
export function hasAssistantMarker(webPreferences: Record<string, unknown> | null | undefined): boolean {
  if (!webPreferences) return false;
  const v = webPreferences[ASSISTANT_WEBVIEW_MARKER_KEY];
  return v === true || v === 'yes' || v === 'true' || v === 1 || v === '1';
}
