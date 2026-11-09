// Verbatim extraction of the UNFIXED window-open decision from `contents.setWindowOpenHandler`
// in the `web-contents-created` handler of src/main/index.ts, taken before any task-3 change.
//
// The Electron calls are lifted into parameters so the logic runs without Electron:
// - `isAuthOrSecurityUrl` is the module-level classifier
// - `mainWindow` is the `mainWindow` variable (used as the popup parent)
// - `activeTab` is `browserManager.getActiveTab()`
// The `browserManager.createTab(details.url, spaceId)` side effect is returned as `createTab`.
//
// Do not edit to follow the fix.

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

export type WindowOpenDecision<W = unknown> =
  | {
      action: 'allow';
      overrideBrowserWindowOptions: {
        width: number;
        height: number;
        title?: string;
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
      };
      createTab?: undefined;
    }
  | { action: 'deny'; createTab: { url: string; spaceId: string } };

export function originalWindowOpenDecision<W>(
  details: WindowOpenDetails,
  ctx: WindowOpenContext<W>,
): WindowOpenDecision<W> {
  const url = details.url || '';
  const hasWindowFeatures =
    details.features &&
    (details.features.includes('width=') ||
      details.features.includes('height=') ||
      details.features.includes('popup='));

  const isPopup =
    details.disposition === 'new-window' ||
    hasWindowFeatures ||
    ctx.isAuthOrSecurityUrl(url) ||
    url === 'about:blank' ||
    !url;

  if (isPopup) {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 540,
        height: 700,
        title: 'Sign In',
        autoHideMenuBar: true,
        backgroundColor: '#121316',
        frame: true, // Native window frame with standard close/minimize controls
        parent: ctx.mainWindow || undefined,
        modal: false,
        webPreferences: {
          partition: 'persist:neutrino',
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      },
    };
  }

  const active = ctx.activeTab;
  const spaceId = active ? active.spaceId : 'space-study';
  return { action: 'deny', createTab: { url: details.url, spaceId } };
}
