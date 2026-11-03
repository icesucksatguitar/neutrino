import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('neutrino', {
  isElectron: true,

  // Navigation
  navigate: (url: string) => ipcRenderer.invoke('neutrino:navigate', url),
  goBack: () => ipcRenderer.invoke('neutrino:go-back'),
  goForward: () => ipcRenderer.invoke('neutrino:go-forward'),
  reload: () => ipcRenderer.invoke('neutrino:reload'),

  // Tabs & Spaces
  createTab: (url?: string, spaceId?: string) => ipcRenderer.invoke('neutrino:create-tab', { url, spaceId }),
  updateTab: (tabId: string, partial: any) => ipcRenderer.invoke('neutrino:update-tab', { tabId, partial }),
  closeTab: (tabId: string) => ipcRenderer.invoke('neutrino:close-tab', tabId),
  selectTab: (tabId: string) => ipcRenderer.invoke('neutrino:select-tab', tabId),
  togglePinTab: (tabId: string) => ipcRenderer.invoke('neutrino:toggle-pin-tab', tabId),
  toggleSleepTab: (tabId: string) => ipcRenderer.invoke('neutrino:toggle-sleep-tab', tabId),
  selectSpace: (spaceId: string) => ipcRenderer.invoke('neutrino:select-space', spaceId),
  createSpace: (name: string, color?: string) => ipcRenderer.invoke('neutrino:create-space', { name, color }),
  deleteSpace: (spaceId: string) => ipcRenderer.invoke('neutrino:delete-space', spaceId),
  reorderTabs: (draggedTabId: string, targetTabId: string) => ipcRenderer.invoke('neutrino:reorder-tabs', { draggedTabId, targetTabId }),
  setZoomFactor: (factor: number) => ipcRenderer.invoke('neutrino:set-zoom-factor', factor),

  // Zoom events
  onZoomUpdated: (callback: (data: { zoomFactor: number }) => void) => {
    const handler = (_: unknown, data: any) => callback(data);
    ipcRenderer.on('neutrino:zoom-updated', handler);
    return () => ipcRenderer.removeListener('neutrino:zoom-updated', handler);
  },

  // Adblock & Zen Optimization
  toggleShields: () => ipcRenderer.invoke('neutrino:toggle-shields'),
  zenOptimize: () => ipcRenderer.invoke('neutrino:zen-optimize'),
  getShieldStats: () => ipcRenderer.invoke('neutrino:get-shield-stats'),

  // Model Context Protocol (MCP)
  callMcp: (method: string, params?: unknown) => ipcRenderer.invoke('neutrino:mcp-call', { method, params }),
  getMcpLogs: () => ipcRenderer.invoke('neutrino:mcp-get-logs'),

  // Media Control & Picture-in-Picture
  mediaControl: (action: string, params?: unknown) => ipcRenderer.invoke('neutrino:media-control', { action, params }),

  // Window Controls
  windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('neutrino:window-control', action),

  // Reactive State Events
  onStateUpdate: (callback: (state: any) => void) => {
    const handler = (_: unknown, state: any) => callback(state);
    ipcRenderer.on('neutrino:state-update', handler);
    return () => ipcRenderer.removeListener('neutrino:state-update', handler);
  },

  onTrackerBlocked: (callback: (item: any) => void) => {
    const handler = (_: unknown, item: any) => callback(item);
    ipcRenderer.on('neutrino:tracker-blocked', handler);
    return () => ipcRenderer.removeListener('neutrino:tracker-blocked', handler);
  },
});
