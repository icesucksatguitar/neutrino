export type TabContainer = 'default' | 'work' | 'personal' | 'banking' | 'incognito';

export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  isPinned: boolean;
  isMuted: boolean;
  container: TabContainer;
  blockedTrackersCount: number;
}

export interface ShieldStats {
  totalInspected: number;
  totalBlocked: number;
  trackersBlocked: number;
  analyticsBlocked: number;
  adsBlocked: number;
  activeRulesCount: number;
}

export interface BlockedItem {
  domain: string;
  category: 'Tracker' | 'Analytics' | 'Advertising' | 'Fingerprinter' | 'Cryptominer' | 'Telemetry';
  rule: string;
  timestamp: number;
}

export interface BrowserSettings {
  searchEngine: 'DuckDuckGo' | 'Brave' | 'Startpage' | 'SearXNG' | 'Google';
  shieldsActive: boolean;
  strictFingerprinting: boolean;
  blockWebRTCLeaks: boolean;
  dohProvider: string;
  autoCleanUtmParams: boolean;
  theme: 'dark' | 'light' | 'system';
}

