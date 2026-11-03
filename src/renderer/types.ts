export interface Space {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface TabState {
  id: string;
  spaceId: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPinned: boolean;
  isSleeping: boolean;
  hasActiveMedia?: boolean;
  blockedCount: number;
}

export interface ActiveMediaState {
  tabId: string;
  tabTitle: string;
  url: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  hasVideo: boolean;
}

export interface ShieldStats {
  totalBlocked: number;
  adsBlocked: number;
  trackersBlocked: number;
  analyticsBlocked: number;
  fingerprintersBlocked: number;
  dataSavedKb: number;
}

export interface ResourceStats {
  memorySavedMb: number;
  sleepingCount: number;
}

export interface BlockedTrackerItem {
  url: string;
  domain: string;
  category?: string;
  rule?: string;
  timestamp: number;
}

export interface BrowserAppState {
  spaces: Space[];
  activeSpaceId: string;
  tabs: TabState[];
  activeTabId: string | null;
  shieldStats: ShieldStats;
  resourceStats: ResourceStats;
}

export interface ThemeConfig {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  bgApp: string;
  bgSidebar: string;
  bgCard: string;
  bgInput: string;
  accent: string;
  textMain: string;
  textMuted: string;
  borderSubtle: string;
  fontSize?: number;
}

declare global {
  interface Window {
    neutrino?: {
      isElectron: boolean;
      navigate: (url: string) => Promise<void>;
      goBack: () => Promise<void>;
      goForward: () => Promise<void>;
      reload: () => Promise<void>;
      createTab: (url?: string, spaceId?: string) => Promise<TabState>;
      closeTab: (tabId: string) => Promise<void>;
      selectTab: (tabId: string) => Promise<void>;
      togglePinTab: (tabId: string) => Promise<void>;
      toggleSleepTab: (tabId: string) => Promise<void>;
      selectSpace: (spaceId: string) => Promise<void>;
      createSpace?: (name: string, color?: string) => Promise<Space>;
      deleteSpace?: (spaceId: string) => Promise<void>;
      reorderTabs?: (draggedTabId: string, targetTabId: string) => Promise<void>;
      toggleShields: () => Promise<boolean>;
      zenOptimize: () => Promise<{ memorySavedMb: number; sleepingCount: number }>;
      getShieldStats: () => Promise<ShieldStats>;
      callMcp: (method: string, params?: unknown) => Promise<any>;
      getMcpLogs: () => Promise<any[]>;
      mediaControl?: (action: string, params?: any) => Promise<any>;
      windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
      onStateUpdate: (cb: (state: BrowserAppState) => void) => () => void;
      onTrackerBlocked: (cb: (item: BlockedTrackerItem) => void) => () => void;
    };
  }
}
