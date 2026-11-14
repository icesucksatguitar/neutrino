// Decides when a tab's <webview> must be told to navigate.
//
// A tab's URL lives in main-process state and is updated from the webview's own `did-navigate`
// events, so most URL changes the renderer sees are echoes of navigations the webview already made.
// Writing those back to the webview (through the `src` attribute or loadURL) reloads the page.
// Electron re-navigates on every `src` write, even with an unchanged value, and state broadcasts
// can lag behind a redirect chain. That replays one-time URLs such as OAuth callbacks
// (`/callback?code=…&state=…`), which then fail validation, and interrupts redirects in progress.
//
// So the webview's `src` is set only once, when it mounts, and later navigations go through
// loadURL only when the requested URL is new: not an echo of a URL the webview reported.

const MAX_PENDING_ECHOES = 32;

export interface WebviewNavState {
  /** Last tab URL seen from app state for this webview. */
  requestedUrl: string;
  /** URLs the webview reported (did-navigate), in order, whose echo has not come back yet. */
  pendingEchoes: string[];
}

export function createWebviewNavState(initialUrl: string): WebviewNavState {
  return { requestedUrl: initialUrl, pendingEchoes: [] };
}

/** Call when the webview reports a committed main-frame navigation. */
export function recordReportedNavigation(state: WebviewNavState, url: string): void {
  if (!url) return;
  state.pendingEchoes.push(url);
  if (state.pendingEchoes.length > MAX_PENDING_ECHOES) {
    state.pendingEchoes.splice(0, state.pendingEchoes.length - MAX_PENDING_ECHOES);
  }
}

/**
 * Call when app state has a (possibly unchanged) URL for the tab. Returns the URL to load, or null
 * when the webview must be left alone: unchanged URL, an echo of the webview's own navigation, or
 * a stale state update from earlier in a redirect chain.
 */
export function nextNavigation(state: WebviewNavState, tabUrl: string): string | null {
  if (!tabUrl || tabUrl === state.requestedUrl) return null;
  state.requestedUrl = tabUrl;

  const echoIndex = state.pendingEchoes.indexOf(tabUrl);
  if (echoIndex !== -1) {
    // Echo of a navigation the webview made; drop it and anything older.
    state.pendingEchoes.splice(0, echoIndex + 1);
    return null;
  }
  return tabUrl;
}
