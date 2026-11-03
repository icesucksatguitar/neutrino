import { useState, useEffect, useCallback } from 'react';
import { BrowserAppState, BlockedTrackerItem, TabState } from '../types';

const INITIAL_STATE: BrowserAppState = {
  spaces: [
    { id: 'space-personal', name: 'Personal', icon: 'Home', color: '#6366f1' },
    { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#3b82f6' },
    { id: 'space-dev', name: 'Dev & AI', icon: 'Terminal', color: '#10b981' },
    { id: 'space-research', name: 'Research', icon: 'Compass', color: '#f59e0b' },
  ],
  activeSpaceId: 'space-personal',
  tabs: [
    {
      id: 'tab-init',
      spaceId: 'space-personal',
      title: 'DuckDuckGo',
      url: 'https://duckduckgo.com',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isPinned: false,
      isSleeping: false,
      blockedCount: 0,
    },
  ],
  activeTabId: 'tab-init',
  shieldStats: {
    totalBlocked: 0,
    adsBlocked: 0,
    trackersBlocked: 0,
    analyticsBlocked: 0,
    fingerprintersBlocked: 0,
    dataSavedKb: 0,
  },
  resourceStats: {
    memorySavedMb: 0,
    sleepingCount: 0,
  },
};

export function useBrowser() {
  const [state, setState] = useState<BrowserAppState>(INITIAL_STATE);
  const [blockedTrackers, setBlockedTrackers] = useState<BlockedTrackerItem[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);
  const [isShieldModalOpen, setIsShieldModalOpen] = useState(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);

  useEffect(() => {
    if (!window.neutrino) return;

    const unregState = window.neutrino.onStateUpdate((newState) => {
      setState(newState);
    });

    const unregTracker = window.neutrino.onTrackerBlocked((item) => {
      setBlockedTrackers((prev) => [
        { ...item, timestamp: Date.now() },
        ...prev.slice(0, 49),
      ]);
    });

    return () => {
      unregState?.();
      unregTracker?.();
    };
  }, []);

  const navigate = useCallback((url: string) => {
    window.neutrino?.navigate(url);
  }, []);

  const createTab = useCallback((url?: string, spaceId?: string) => {
    return window.neutrino?.createTab(url, spaceId);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    window.neutrino?.closeTab(tabId);
  }, []);

  const selectTab = useCallback((tabId: string) => {
    window.neutrino?.selectTab(tabId);
  }, []);

  const togglePinTab = useCallback((tabId: string) => {
    window.neutrino?.togglePinTab(tabId);
  }, []);

  const toggleSleepTab = useCallback((tabId: string) => {
    window.neutrino?.toggleSleepTab(tabId);
  }, []);

  const selectSpace = useCallback((spaceId: string) => {
    window.neutrino?.selectSpace(spaceId);
  }, []);

  const toggleShields = useCallback(() => {
    window.neutrino?.toggleShields();
  }, []);

  const zenOptimize = useCallback(() => {
    window.neutrino?.zenOptimize();
  }, []);

  const activeTab: TabState | undefined =
    state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];

  const currentSpaceTabs = state.tabs.filter(
    (t) => t.spaceId === state.activeSpaceId
  );

  return {
    state,
    activeTab,
    currentSpaceTabs,
    blockedTrackers,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isCommandBarOpen,
    setIsCommandBarOpen,
    isShieldModalOpen,
    setIsShieldModalOpen,
    isMcpModalOpen,
    setIsMcpModalOpen,
    navigate,
    createTab,
    closeTab,
    selectTab,
    togglePinTab,
    toggleSleepTab,
    selectSpace,
    toggleShields,
    zenOptimize,
  };
}
