// Pure window.open / target="_blank" routing, used by setWindowOpenHandler in src/main/index.ts.
// Popups (sign-in windows and anything opened with window features) stay real child windows so
// `window.opener` keeps working for OAuth popup flows; plain links open as Neutrino tabs.

export interface WindowOpenDetails {
  url: string;
  disposition: string;
  features: string;
}

export interface WindowOpenContext<W = unknown> {
  isAuthOrSecurityUrl: (url: string) => boolean;
  mainWindow: W | null;
  activeTab: { spaceId: string } | null;
}

export interface PopupWindowOptions<W = unknown> {
  width: number;
  height: number;
  title: string;
  autoHideMenuBar: boolean;
  backgroundColor: string;
  frame: boolean;
  parent: W | undefined;
  modal: boolean;
  webPreferences: {
    partition: string;
    contextIsolation: boolean;
    nodeIntegration: boolean;
    sandbox: boolean;
  };
}

export type WindowOpenDecision<W = unknown> =
  | { action: 'allow'; overrideBrowserWindowOptions: PopupWindowOptions<W>; createTab?: undefined }
  | { action: 'deny'; createTab: { url: string; spaceId: string } };

/** Initial popup title: the host it loads. The page's own <title> replaces it once loaded. */
export function popupTitle(url: string): string {
  try {
    const parsed = new URL(url);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) return parsed.hostname;
  } catch {
    // fall through
  }
  return 'Neutrino';
}

export function buildPopupWindowOptions<W>(url: string, mainWindow: W | null | undefined): PopupWindowOptions<W> {
  return {
    width: 540,
    height: 700,
    title: popupTitle(url),
    autoHideMenuBar: true,
    backgroundColor: '#121316',
    frame: true, // Native window frame with standard close/minimize controls
    parent: mainWindow || undefined,
    modal: false,
    webPreferences: {
      // Same partition as every tab and the assistant drawer, so the popup shares the opener's
      // cookies and the site sees the sign-in result.
      partition: 'persist:neutrino',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };
}

export function decideWindowOpen<W>(details: WindowOpenDetails, ctx: WindowOpenContext<W>): WindowOpenDecision<W> {
  const url = details.url || '';
  const hasWindowFeatures =
    !!details.features &&
    (details.features.includes('width=') || details.features.includes('height=') || details.features.includes('popup='));

  const isPopup =
    details.disposition === 'new-window' || hasWindowFeatures || ctx.isAuthOrSecurityUrl(url) || url === 'about:blank' || !url;

  if (isPopup) {
    return { action: 'allow', overrideBrowserWindowOptions: buildPopupWindowOptions(url, ctx.mainWindow) };
  }

  const spaceId = ctx.activeTab ? ctx.activeTab.spaceId : 'space-study';
  return { action: 'deny', createTab: { url: details.url, spaceId } };
}
