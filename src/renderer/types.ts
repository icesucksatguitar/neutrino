import type { BrowserSettings, SpaceTheme, SpaceThemesMap } from '../main/settings';
import type { SpaceThemeMode, SpaceThemePoint, SpaceThemePreset, ThemePalette } from '../main/spaceTheme';

export type { BrowserSettings, SpaceTheme, SpaceThemesMap, SpaceThemeMode, SpaceThemePoint, SpaceThemePreset, ThemePalette };

export interface Space {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export type SpaceState = Space;

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
  zoomFactor?: number;
  previewImage?: string;
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

/** Sent when Google refuses a sign-in inside Neutrino (see src/main/authHandoff.ts). */
export interface AuthHandoffNotice {
  handoffId: string;
  provider: 'google';
  reason: 'browser-not-secure' | 'disallowed-useragent';
  siteHost: string;
  isPopup: boolean;
}

export type { HistoryEntry, HistoryClearRange, HistoryQueryOptions } from '../main/history';
export type {
  VpnMode,
  DohProviderId,
  ProxyProtocol,
  VpnConfig,
  VpnStatus,
  VpnIpCheckResult,
} from '../main/vpnCore';
import type { HistoryEntry, HistoryClearRange, HistoryQueryOptions } from '../main/history';
import type { VpnConfig, VpnStatus, VpnIpCheckResult } from '../main/vpnCore';

export type AuthHandoffResult = { ok: true; siteHost: string } | { ok: false; error: string };

export type SiteAction = 'back' | 'forward' | 'reload' | 'hard-reload' | 'stop' | 'home' | 'open-find';

declare global {
  interface Window {
    neutrino?: {
      isElectron: boolean;
      navigate: (url: string) => Promise<void>;
      goBack: () => Promise<void>;
      goForward: () => Promise<void>;
      reload: () => Promise<void>;
      hardReload?: () => Promise<void>;
      stopLoading?: () => Promise<void>;
      reopenClosedTab?: () => Promise<TabState | null>;
      cycleTab?: (direction: 1 | -1) => Promise<TabState | null>;
      openExternalUrl?: (url: string) => Promise<boolean>;
      onSiteAction?: (cb: (payload: { action: SiteAction; source?: string }) => void) => () => void;
      onSpaceSwitched?: (cb: (payload: { spaceId: string; spaceName: string }) => void) => () => void;
      getState?: () => Promise<BrowserAppState>;
      createTab: (url?: string, spaceId?: string) => Promise<TabState>;
      updateTab?: (tabId: string, partial: Partial<TabState>) => Promise<void>;
      closeTab: (tabId: string) => Promise<void>;
      selectTab: (tabId: string) => Promise<void>;
      togglePinTab: (tabId: string) => Promise<void>;
      toggleSleepTab: (tabId: string) => Promise<void>;
      selectSpace: (spaceId: string) => Promise<void>;
      createSpace?: (name: string, color?: string) => Promise<Space | null>;
      deleteSpace?: (spaceId: string) => Promise<boolean | void>;
      reorderTabs?: (draggedTabId: string, targetTabId: string) => Promise<void>;
      setZoomFactor?: (factor: number) => Promise<void>;
      onZoomUpdated?: (cb: (data: { zoomFactor: number }) => void) => () => void;
      toggleShields: () => Promise<boolean>;
      toggleSiteWhitelist?: (domainOrUrl: string) => Promise<{ domain: string; whitelisted: boolean; shieldWhitelist: string[] }>;
      resetShieldStats?: () => Promise<ShieldStats>;
      zenOptimize: () => Promise<{ memorySavedMb: number; sleepingCount: number }>;
      getShieldStats: () => Promise<ShieldStats>;
      callMcp: (method: string, params?: unknown) => Promise<any>;
      getMcpLogs: () => Promise<any[]>;
      mediaControl?: (action: string, params?: any) => Promise<any>;
      captureTabPreview?: (tabUrl: string) => Promise<string | null>;
      windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
      setThemeMode?: (mode: 'dark' | 'light' | 'system') => Promise<{ success: boolean; isDark?: boolean }>;
      getSettings?: () => Promise<BrowserSettings>;
      updateSettings?: (patch: Partial<BrowserSettings>) => Promise<BrowserSettings>;
      onSettingsUpdated?: (cb: (settings: BrowserSettings) => void) => () => void;
      onOpenSettings?: (cb: () => void) => () => void;
      onStateUpdate: (cb: (state: BrowserAppState) => void) => () => void;
      onTrackerBlocked: (cb: (item: BlockedTrackerItem) => void) => () => void;
      onCloseActiveTab?: (cb: () => void) => () => void;
      onOpenCommandBar?: (cb: () => void) => () => void;
      onToggleTabs?: (cb: () => void) => () => void;
      onEscapePressed?: (cb: () => void) => () => void;
      onAuthHandoffRequired?: (cb: (notice: AuthHandoffNotice) => void) => () => void;
      openAuthHandoff?: (handoffId: string) => Promise<AuthHandoffResult>;
      copyAuthHandoffLink?: (handoffId: string) => Promise<AuthHandoffResult>;
      dismissAuthHandoff?: (handoffId: string) => Promise<AuthHandoffResult>;
      getHistory?: (options?: HistoryQueryOptions) => Promise<HistoryEntry[]>;
      deleteHistoryEntry?: (target: { id?: string; url?: string; timestamp?: number }) => Promise<boolean>;
      clearHistory?: (range?: HistoryClearRange) => Promise<number>;
      onHistoryUpdated?: (cb: (entries: HistoryEntry[]) => void) => () => void;
      onOpenHistory?: (cb: () => void) => () => void;
      getVpnStatus?: () => Promise<VpnStatus>;
      connectVpn?: (patch?: Partial<VpnConfig>) => Promise<VpnStatus>;
      disconnectVpn?: () => Promise<VpnStatus>;
      updateVpnConfig?: (patch: Partial<VpnConfig>) => Promise<VpnStatus>;
      checkVpnIp?: () => Promise<VpnIpCheckResult | { error: string }>;
      onVpnStatusUpdated?: (cb: (status: VpnStatus) => void) => () => void;
    };
  }
}
