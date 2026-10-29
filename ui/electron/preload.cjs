const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neutrino', {
  isElectron: true,
  checkUrl: (url) => ipcRenderer.invoke('neutrino:check-url', url),
  cleanUrl: (url) => ipcRenderer.invoke('neutrino:clean-url', url),
  getStats: () => ipcRenderer.invoke('neutrino:get-stats'),
  windowControl: (action) => ipcRenderer.invoke('neutrino:window-control', action),
  onTrackerBlocked: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('neutrino:tracker-blocked', handler);
    return () => ipcRenderer.removeListener('neutrino:tracker-blocked', handler);
  },
});
