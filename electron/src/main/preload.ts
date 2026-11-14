import { contextBridge, ipcRenderer, webFrame } from 'electron';

// Allow main process idle hook to purge Blink's decoded image/font/CSS caches safely
ipcRenderer.on('neutrino:trim-memory', () => {
  try {
    webFrame.clearCache();
  } catch { }
});

contextBridge.exposeInMainWorld('neutrino', {
  isElectron: true,

  // Navigation & Site Controls
  navigate: (url: string) => ipcRenderer.invoke('neutrino:navigate', url),
  goBack: () => ipcRenderer.invoke('neutrino:go-back'),
  goForward: () => ipcRenderer.invoke('neutrino:go-forward'),
  reload: () => ipcRenderer.invoke('neutrino:reload'),
  hardReload: () => ipcRenderer.invoke('neutrino:hard-reload'),
  stopLoading: () => ipcRenderer.invoke('neutrino:stop-loading'),
  reopenClosedTab: () => ipcRenderer.invoke('neutrino:reopen-closed-tab'),
  cycleTab: (direction: 1 | -1) => ipcRenderer.invoke('neutrino:cycle-tab', direction),
  openExternalUrl: (url: string) => ipcRenderer.invoke('neutrino:open-external-url', url),
  onSiteAction: (callback: (payload: { action: string; source?: string }) => void) => {
    const handler = (_: unknown, payload: any) => callback(payload);
    ipcRenderer.on('neutrino:site-action', handler);
    return () => ipcRenderer.removeListener('neutrino:site-action', handler);
  },
  onSpaceSwitched: (callback: (payload: { spaceId: string; spaceName: string }) => void) => {
    const handler = (_: unknown, payload: any) => callback(payload);
    ipcRenderer.on('neutrino:space-switched', handler);
    return () => ipcRenderer.removeListener('neutrino:space-switched', handler);
  },

  // Tabs & Spaces
  createTab: (url?: string, spaceId?: string) => ipcRenderer.invoke('neutrino:create-tab', { url, spaceId }),
  updateTab: (tabId: string, partial: any) => ipcRenderer.invoke('neutrino:update-tab', { tabId, partial }),
  closeTab: (tabId: string) => ipcRenderer.invoke('neutrino:close-tab', tabId),
  selectTab: (tabId: string) => ipcRenderer.invoke('neutrino:select-tab', tabId),
  togglePinTab: (tabId: string) => ipcRenderer.invoke('neutrino:toggle-pin-tab', tabId),
  toggleSleepTab: (tabId: string) => ipcRenderer.invoke('neutrino:toggle-sleep-tab', tabId),
  selectSpace: (spaceId: string) => ipcRenderer.invoke('neutrino:select-space', spaceId),
  createSpace: (name: string, color?: string, profileId?: string) =>
    ipcRenderer.invoke('neutrino:create-space', profileId === undefined ? { name, color } : { name, color, profileId }),
  deleteSpace: (spaceId: string) => ipcRenderer.invoke('neutrino:delete-space', spaceId),
  updateSpace: (spaceId: string, patch: { name?: string; color?: string; icon?: string }) =>
    ipcRenderer.invoke('neutrino:update-space', { spaceId, patch }),
  reorderSpace: (spaceId: string, toIndex: number) => ipcRenderer.invoke('neutrino:reorder-space', { spaceId, toIndex }),

  // Profiles. Each profile owns its spaces and one session partition; main validates every payload.
  listProfiles: () => ipcRenderer.invoke('neutrino:list-profiles'),
  createProfile: (name?: string) => ipcRenderer.invoke('neutrino:create-profile', name),
  renameProfile: (profileId: string, name: string) => ipcRenderer.invoke('neutrino:rename-profile', { profileId, name }),
  deleteProfile: (profileId: string) => ipcRenderer.invoke('neutrino:delete-profile', profileId),
  onTabPartitionChanged: (callback: (change: { tabId: string; partition: string; url: string }) => void) => {
    const handler = (_: unknown, change: any) => callback(change);
    ipcRenderer.on('neutrino:tab-partition-changed', handler);
    return () => ipcRenderer.removeListener('neutrino:tab-partition-changed', handler);
  },

  // Sidebar layout (favorites / pinned / Today)
  moveTab: (op: unknown) => ipcRenderer.invoke('neutrino:move-tab', op),
  pinTab: (tabId: string) => ipcRenderer.invoke('neutrino:pin-tab', tabId),
  unpinTab: (tabId: string) => ipcRenderer.invoke('neutrino:unpin-tab', tabId),
  addFavorite: (tabId: string) => ipcRenderer.invoke('neutrino:add-favorite', tabId),
  removeFavorite: (favoriteId: string) => ipcRenderer.invoke('neutrino:remove-favorite', favoriteId),
  duplicateTab: (id: string, spaceId?: string) =>
    ipcRenderer.invoke('neutrino:duplicate-tab', spaceId === undefined ? { id } : { id, spaceId }),

  // Persistent Folders in Pinned Section
  createFolder: (spaceId: string, name: string) => ipcRenderer.invoke('neutrino:create-folder', { spaceId, name }),
  updateFolder: (folderId: string, patch: any) => ipcRenderer.invoke('neutrino:update-folder', { folderId, patch }),
  deleteFolder: (folderId: string) => ipcRenderer.invoke('neutrino:delete-folder', folderId),
  moveTabToFolder: (tabId: string, folderId: string | null) =>
    ipcRenderer.invoke('neutrino:move-tab-to-folder', { tabId, folderId }),

  // Archive of auto-archived Today tabs (R16.7, R16.8)
  listArchive: () => ipcRenderer.invoke('neutrino:list-archive'),
  restoreArchivedTab: (archivedId: string) => ipcRenderer.invoke('neutrino:restore-archived-tab', archivedId),
  onArchiveUpdated: (callback: (entries: unknown[]) => void) => {
    const handler = (_: unknown, entries: unknown[]) => callback(entries);
    ipcRenderer.on('neutrino:archive-updated', handler);
    return () => ipcRenderer.removeListener('neutrino:archive-updated', handler);
  },

  // Sidebar state lives in settings; only the sidebar keys are forwarded.
  updateSidebarState: (patch: Record<string, unknown>) => {
    const keys = ['sidebarExpanded', 'sidebarAutoHide', 'rightPinsDockVisible', 'archiveIntervalHours'];
    const picked: Record<string, unknown> = {};
    if (patch && typeof patch === 'object') {
      for (const key of keys) if (key in patch) picked[key] = patch[key];
    }
    return ipcRenderer.invoke('neutrino:update-settings', picked);
  },
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

  // Hover previews, keyed by tab id (R18.3-R18.7)
  captureTabPreviewById: (tabId: string) => ipcRenderer.invoke('neutrino:capture-tab-preview-by-id', tabId),
  getTabPreview: (tabId: string) => ipcRenderer.invoke('neutrino:get-tab-preview', tabId),
  /** Tells main which guest webContents hosts the tab's webview (needed for capture by id). */
  registerTabWebview: (tabId: string, webContentsId: number) =>
    ipcRenderer.invoke('neutrino:register-tab-webview', { tabId, webContentsId }),
  /** Top bar tint fallback (R20.2): dominant color of the tab page's top strip, or null. */
  sampleTabTopColor: (tabId: string) => ipcRenderer.invoke('neutrino:sample-tab-top-color', tabId),
  /** Compatibility shim: the old URL-based call, resolved to a tab id in main. */
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

  // `{ newTab: true }` for Ctrl+T: the submission creates a Today tab in the active space (R12.8).
  onOpenCommandBar: (callback: (opts?: { newTab?: boolean }) => void) => {
    const handler = (_: unknown, opts?: { newTab?: boolean }) =>
      callback(opts && typeof opts === 'object' ? { newTab: opts.newTab === true } : undefined);
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

  // Password manager (Active_Profile). No call returns a password except revealPassword after
  // verification; copyPassword writes the clipboard in main. Prompt events carry origin and
  // username only.
  onPasswordPrompt: (
    callback: (prompt: {
      promptId: string;
      kind: 'save' | 'update';
      profileId: string;
      webContentsId: number;
      origin: string;
      username: string;
    }) => void,
  ) => {
    const handler = (_: unknown, prompt: any) => callback(prompt);
    ipcRenderer.on('neutrino:password-prompt', handler);
    return () => ipcRenderer.removeListener('neutrino:password-prompt', handler);
  },
  onPasswordPromptClosed: (callback: (payload: { promptId: string }) => void) => {
    const handler = (_: unknown, payload: any) => callback(payload);
    ipcRenderer.on('neutrino:password-prompt-closed', handler);
    return () => ipcRenderer.removeListener('neutrino:password-prompt-closed', handler);
  },
  respondToPasswordPrompt: (promptId: string, action: 'save' | 'update' | 'never' | 'not-now' | 'dismiss') =>
    ipcRenderer.invoke('neutrino:password-prompt-respond', { promptId, action }),
  getPasswordStatus: () => ipcRenderer.invoke('neutrino:passwords-status'),
  listPasswords: () => ipcRenderer.invoke('neutrino:passwords-list'),
  editPassword: (credentialId: string, patch: { username?: string; password?: string }) =>
    ipcRenderer.invoke('neutrino:passwords-edit', { credentialId, username: patch?.username, password: patch?.password }),
  deletePassword: (credentialId: string) => ipcRenderer.invoke('neutrino:passwords-delete', credentialId),
  revealPassword: (credentialId: string) => ipcRenderer.invoke('neutrino:passwords-reveal', credentialId),
  copyPassword: (credentialId: string) => ipcRenderer.invoke('neutrino:passwords-copy', credentialId),
  confirmPasswordAction: (confirmId: string, accepted: boolean) =>
    ipcRenderer.invoke('neutrino:passwords-confirm', { confirmId, accepted }),
  getPasswordNeverList: () => ipcRenderer.invoke('neutrino:passwords-never-list'),
  removeFromPasswordNeverList: (origin: string) => ipcRenderer.invoke('neutrino:passwords-never-list-remove', origin),
  importPasswordsCsv: () => ipcRenderer.invoke('neutrino:passwords-import-csv'),
  importPasswordsFromBrowser: () => ipcRenderer.invoke('neutrino:passwords-import-browser'),
  commitPasswordImport: (importId: string, choices?: Record<number, 'keep' | 'replace'>) =>
    ipcRenderer.invoke('neutrino:passwords-import-commit', { importId, choices }),
  cancelPasswordImport: (importId: string) => ipcRenderer.invoke('neutrino:passwords-import-cancel', importId),

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
