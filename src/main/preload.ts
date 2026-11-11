import { contextBridge, ipcRenderer, webFrame } from 'electron';

// Allow main process idle hook to purge Blink's decoded image/font/CSS caches safely
ipcRenderer.on('neutrino:trim-memory', () => {
  try {
    webFrame.clearCache();
  } catch { }
});

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

  // Zoom events (for webpage/webview zoom)
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
  captureTabPreview: (tabUrl: string) => ipcRenderer.invoke('neutrino:capture-tab-preview', tabUrl),

  // Window Controls
  windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('neutrino:window-control', action),

  // Theme Controls
  setThemeMode: (mode: 'dark' | 'light' | 'system') => ipcRenderer.invoke('neutrino:set-theme-mode', mode),

  // Browser Settings
  getSettings: () => ipcRenderer.invoke('neutrino:get-settings'),
  updateSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('neutrino:update-settings', patch),

  onSettingsUpdated: (callback: (settings: any) => void) => {
    const handler = (_: unknown, settings: any) => callback(settings);
    ipcRenderer.on('neutrino:settings-updated', handler);
    return () => ipcRenderer.removeListener('neutrino:settings-updated', handler);
  },

  onOpenSettings: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('neutrino:open-settings', handler);
    return () => ipcRenderer.removeListener('neutrino:open-settings', handler);
  },

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

  onCloseActiveTab: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('neutrino:close-active-tab', handler);
    return () => ipcRenderer.removeListener('neutrino:close-active-tab', handler);
  },

  onOpenCommandBar: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('neutrino:open-command-bar', handler);
    return () => ipcRenderer.removeListener('neutrino:open-command-bar', handler);
  },

  onToggleTabs: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('neutrino:toggle-tabs', handler);
    return () => ipcRenderer.removeListener('neutrino:toggle-tabs', handler);
  },

  // Google sign-in handoff. The renderer only ever passes the handoff id; the URL to open stays in
  // the main process (see src/main/authHandoff.ts).
  onAuthHandoffRequired: (callback: (notice: any) => void) => {
    const handler = (_: unknown, notice: any) => callback(notice);
    ipcRenderer.on('neutrino:auth-handoff-required', handler);
    return () => ipcRenderer.removeListener('neutrino:auth-handoff-required', handler);
  },
  openAuthHandoff: (handoffId: string) => ipcRenderer.invoke('neutrino:auth-handoff-open', handoffId),
  copyAuthHandoffLink: (handoffId: string) => ipcRenderer.invoke('neutrino:auth-handoff-copy', handoffId),
  dismissAuthHandoff: (handoffId: string) => ipcRenderer.invoke('neutrino:auth-handoff-dismiss', handoffId),

  onEscapePressed: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('neutrino:escape-pressed', handler);
    return () => ipcRenderer.removeListener('neutrino:escape-pressed', handler);
  },

  // Browsing History
  getHistory: (options?: { query?: string; limit?: number; offset?: number; spaceId?: string }) =>
    ipcRenderer.invoke('neutrino:get-history', options),
  deleteHistoryEntry: (target: { id?: string; url?: string; timestamp?: number }) =>
    ipcRenderer.invoke('neutrino:delete-history-entry', target),
  clearHistory: (range: 'hour' | 'day' | 'all' = 'all') =>
    ipcRenderer.invoke('neutrino:clear-history', range),
  onHistoryUpdated: (callback: (entries: any[]) => void) => {
    const handler = (_: unknown, entries: any[]) => callback(entries);
    ipcRenderer.on('neutrino:history-updated', handler);
    return () => ipcRenderer.removeListener('neutrino:history-updated', handler);
  },
  onOpenHistory: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('neutrino:open-history', handler);
    return () => ipcRenderer.removeListener('neutrino:open-history', handler);
  },

  // Built-in VPN / Privacy Tunnel
  getVpnStatus: () => ipcRenderer.invoke('neutrino:get-vpn-status'),
  connectVpn: (patch?: unknown) => ipcRenderer.invoke('neutrino:connect-vpn', patch),
  disconnectVpn: () => ipcRenderer.invoke('neutrino:disconnect-vpn'),
  updateVpnConfig: (patch: unknown) => ipcRenderer.invoke('neutrino:update-vpn-config', patch),
  checkVpnIp: () => ipcRenderer.invoke('neutrino:check-vpn-ip'),
  onVpnStatusUpdated: (callback: (status: any) => void) => {
    const handler = (_: unknown, status: any) => callback(status);
    ipcRenderer.on('neutrino:vpn-status-updated', handler);
    return () => ipcRenderer.removeListener('neutrino:vpn-status-updated', handler);
  },
});
