// Verbatim copy of the UNFIXED popup BrowserWindow options returned by
// setWindowOpenHandler in src/main/index.ts (action: 'allow' branch).
// `mainWindow` is passed in. Do not edit.

export function originalPopupWindowOptions(_url: string, mainWindow: unknown) {
  return {
    width: 540,
    height: 700,
    title: 'Sign In',
    autoHideMenuBar: true,
    backgroundColor: '#121316',
    frame: true, // Native window frame with standard close/minimize controls
    parent: mainWindow || undefined,
    modal: false,
    webPreferences: {
      partition: 'persist:neutrino',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };
}
