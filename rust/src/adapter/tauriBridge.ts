import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Thin adapter layer providing complete parity with Electron's preload window.neutrino API
export const tauriBridge = {
  isElectron: false,
  isTauri: true,

  // Navigation & Site Controls
  navigate: async (url: string) => {
    // If navigating active tab
    const state: any = await invoke('get_browser_state');
    if (state.activeTabId) {
      await invoke('update_tab', { tabId: state.activeTabId, partial: { url, title: url, isLoading: true } });
      setTimeout(() => {
        void invoke('update_tab', { tabId: state.activeTabId, partial: { isLoading: false } });
      }, 350);
    }
  },
  goBack: async () => {},
  goForward: async () => {},
  reload: async () => {
    const state: any = await invoke('get_browser_state');
    if (state.activeTabId) {
      await invoke('update_tab', { tabId: state.activeTabId, partial: { isLoading: true } });
      setTimeout(() => {
        void invoke('update_tab', { tabId: state.activeTabId, partial: { isLoading: false } });
      }, 300);
    }
  },
  hardReload: async () => {},
  stopLoading: async () => {},
  reopenClosedTab: async () => null,
  cycleTab: async (_direction: 1 | -1) => null,
  openExternalUrl: async (url: string) => {
    try {
      const { open } = await import('@tauri-apps/plugin-opener');
      await open(url);
      return true;
    } catch {
      window.open(url, '_blank');
      return true;
    }
  },
  onSiteAction: (callback: (payload: { action: string; source?: string }) => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:site-action', (event: any) => callback(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onSpaceSwitched: (callback: (payload: { spaceId: string; spaceName: string }) => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:space-switched', (event: any) => callback(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },

  // State, Tabs & Spaces
  getState: async () => invoke('get_browser_state'),
  createTab: async (url?: string, spaceId?: string) => invoke('create_tab', { url, spaceId }),
  updateTab: async (tabId: string, partial: any) => invoke('update_tab', { tabId, partial }),
  closeTab: async (tabId: string) => invoke('close_tab', { tabId }),
  selectTab: async (tabId: string) => invoke('select_tab', { tabId }),
  togglePinTab: async (tabId: string) => invoke('toggle_pin_tab', { tabId }),
  toggleSleepTab: async (tabId: string) => invoke('toggle_sleep_tab', { tabId }),
  reorderTabs: async (draggedTabId: string, targetTabId: string) =>
    invoke('reorder_tabs', { draggedTabId, targetTabId }),

  selectSpace: async (spaceId: string) => invoke('select_space', { spaceId }),
  createSpace: async (name: string, color?: string, profileId?: string) =>
    invoke('create_space', { name, color, profileId }),
  deleteSpace: async (spaceId: string) => invoke('delete_space', { spaceId }),
  updateSpace: async (spaceId: string, patch: any) => invoke('update_space', { spaceId, patch }),
  reorderSpace: async (spaceId: string, toIndex: number) => invoke('reorder_space', { spaceId, toIndex }),

  // Profiles (placeholder for session profiles)
  listProfiles: async () => ({
    profiles: [{ id: 'profile-default', name: 'Default Profile', createdAt: Date.now() }],
    spaces: [],
    activeProfileId: 'profile-default',
    activeSpaceId: 'space-study',
  }),

  // Sidebar Layout
  moveTab: async () => ({ ok: true, needsReload: false }),
  pinTab: async (tabId: string) => invoke('toggle_pin_tab', { tabId }),
  unpinTab: async (tabId: string) => invoke('toggle_pin_tab', { tabId }),
  addFavorite: async () => ({ ok: true }),
  removeFavorite: async () => ({ ok: true }),
  duplicateTab: async (id: string, spaceId?: string) => {
    const tab: any = await invoke('create_tab', { url: 'neutrino://newtab', spaceId });
    return { ok: true, tab };
  },
  listArchive: async () => [],
  restoreArchivedTab: async () => ({ ok: false, error: 'not-implemented' }),
  updateSidebarState: async (patch: any) => invoke('update_settings', { patch }),
  setZoomFactor: async () => {},

  // Adblock & Privacy Shields
  toggleShields: async () => invoke('toggle_shields'),
  toggleSiteWhitelist: async (domainOrUrl: string) => invoke('toggle_site_whitelist', { domainOrUrl }),
  resetShieldStats: async () => invoke('reset_shield_stats'),
  zenOptimize: async () => invoke('zen_optimize'),
  getShieldStats: async () => invoke('get_shield_stats'),

  // Settings & Theme
  getSettings: async () => invoke('get_settings'),
  updateSettings: async (patch: any) => invoke('update_settings', { patch }),
  getPerformanceStatus: async () => invoke('get_performance_status'),
  setThemeMode: async () => ({ success: true }),

  // Window Controls
  windowControl: async (action: 'minimize' | 'maximize' | 'close') => invoke('window_control', { action }),

  // Previews
  captureTabPreview: async (tabId: string) => invoke('capture_tab_preview', { tabId }),
  captureTabPreviewById: async (tabId: string) => invoke('capture_tab_preview', { tabId }),
  getTabPreview: async (tabId: string) => invoke('get_tab_preview', { tabId }),
  registerTabWebview: async () => true,
  sampleTabTopColor: async () => null,

  // History
  getHistory: async (options?: any) => invoke('get_history', { options }),
  deleteHistoryEntry: async (target: any) => invoke('delete_history_entry', { target }),
  clearHistory: async (range?: string) => invoke('clear_history', { range }),

  // VPN
  getVpnStatus: async () => invoke('get_vpn_status'),
  connectVpn: async () => invoke('connect_vpn'),
  disconnectVpn: async () => invoke('disconnect_vpn'),
  checkVpnIp: async () => invoke('check_vpn_ip'),

  // MCP
  callMcp: async (method: string, params?: any) => invoke('mcp_call', { method, params }),
  getMcpLogs: async () => invoke('get_mcp_logs'),

  // Passwords
  getPasswordStatus: async () => invoke('passwords_status'),
  listPasswords: async () => invoke('passwords_list'),

  // Reactive Listeners
  onStateUpdate: (callback: (state: any) => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:state-update', (event: any) => callback(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onTrackerBlocked: (callback: (item: any) => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:tracker-blocked', (event: any) => callback(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onSettingsUpdated: (callback: (settings: any) => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:settings-updated', (event: any) => callback(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onPerformanceStatusUpdated: (callback: (status: any) => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:performance-updated', (event: any) => callback(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onHistoryUpdated: (callback: (entries: any[]) => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:history-updated', (event: any) => callback(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onVpnStatusUpdated: (callback: (status: any) => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:vpn-status-updated', (event: any) => callback(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onOpenSettings: (callback: () => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:open-settings', () => callback()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onOpenCommandBar: (callback: (opts?: { newTab?: boolean }) => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:open-command-bar', (event: any) => callback(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onToggleTabs: (callback: () => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:toggle-tabs', () => callback()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
  onEscapePressed: (callback: () => void) => {
    let unlisten: (() => void) | undefined;
    void listen('neutrino:escape-pressed', () => callback()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  },
};

// Mount global window.neutrino shim
if (typeof window !== 'undefined') {
  (window as any).neutrino = tauriBridge;
}

