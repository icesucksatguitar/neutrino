import { useState, useEffect, useCallback } from 'react';
import { BrowserAppState, BlockedTrackerItem, TabState } from '../types';

const INITIAL_STATE: BrowserAppState = {
  spaces: [
    { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
    { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' },
    { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' },
  ],
  activeSpaceId: 'space-study',
  tabs: [
    {
      id: 'tab-init',
      spaceId: 'space-study',
      title: 'New Tab',
      url: 'neutrino://newtab',
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
      // Normalize spaces to Study, Work, Leisure
      const normalizedSpaces = (newState.spaces || []).map((sp) => {
        if (sp.id === 'space-default' || sp.name === 'DEFAULT' || sp.id === 'space-study') {
          return { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' };
        }
        if (sp.id === 'space-plan' || sp.name === 'PLAN' || sp.id === 'space-work') {
          return { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' };
        }
        if (sp.id === 'space-max' || sp.name === 'MAX' || sp.id === 'space-leisure') {
          return { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' };
        }
        return sp;
      });

      let activeSp = newState.activeSpaceId;
      if (activeSp === 'space-default') activeSp = 'space-study';
      if (activeSp === 'space-plan') activeSp = 'space-work';
      if (activeSp === 'space-max') activeSp = 'space-leisure';

      setState({
        ...newState,
        spaces: normalizedSpaces.length > 0 ? normalizedSpaces : INITIAL_STATE.spaces,
        activeSpaceId: activeSp || 'space-study',
      });
    });

    const unregCloseActiveTab = window.neutrino.onCloseActiveTab?.(() => {
      setState((prev) => {
        if (!prev.activeTabId) return prev;
        const curTabId = prev.activeTabId;
        const remaining = prev.tabs.filter((t) => t.id !== curTabId);
        const nextActive = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        return {
          ...prev,
          tabs: remaining,
          activeTabId: nextActive,
        };
      });
    });

    // High-performance batched tracker updates (prevents UI thread hitching on heavy pages)
    const trackerQueue: BlockedTrackerItem[] = [];
    let trackerFlushTimer: any = null;

    const flushTrackerQueue = () => {
      trackerFlushTimer = null;
      if (trackerQueue.length === 0) return;

      const itemsToFlush = trackerQueue.splice(0, trackerQueue.length);
      const totalCount = itemsToFlush.length;
      let adsCount = 0;
      for (const it of itemsToFlush) {
        if (it.category === 'Advertising') adsCount++;
      }

      setBlockedTrackers((prev) => [
        ...itemsToFlush.map((it) => ({ ...it, timestamp: it.timestamp || Date.now() })),
        ...prev,
      ].slice(0, 50));

      setState((prev) => ({
        ...prev,
        shieldStats: {
          ...prev.shieldStats,
          totalBlocked: prev.shieldStats.totalBlocked + totalCount,
          trackersBlocked: prev.shieldStats.trackersBlocked + totalCount,
          adsBlocked: prev.shieldStats.adsBlocked + adsCount,
        },
      }));
    };

    const unregTracker = window.neutrino.onTrackerBlocked?.((item) => {
      trackerQueue.push(item);
      if (!trackerFlushTimer) {
        trackerFlushTimer = setTimeout(flushTrackerQueue, 250);
      }
    });

    // Initial shield stats fetch
    window.neutrino.getShieldStats?.().then((stats: any) => {
      if (stats) {
        setState((prev) => ({
          ...prev,
          shieldStats: { ...prev.shieldStats, ...stats },
        }));
      }
    }).catch(() => {});

    const handleMockTabs = (e: any) => {
      if (e.detail?.tabs) {
        setState((prev) => ({
          ...prev,
          tabs: e.detail.tabs,
          activeTabId: e.detail.activeTabId || e.detail.tabs[0]?.id || prev.activeTabId,
        }));
      }
    };
    window.addEventListener('neutrino:mock-tabs', handleMockTabs);

    return () => {
      if (trackerFlushTimer) clearTimeout(trackerFlushTimer);
      unregState?.();
      unregCloseActiveTab?.();
      unregTracker?.();
      window.removeEventListener('neutrino:mock-tabs', handleMockTabs);
    };
  }, []);

  const navigate = useCallback((url: string) => {
    // neutrino://settings opens the Settings panel and leaves the Active_Tab URL unchanged.
    if (typeof url === 'string' && url.trim().toLowerCase() === 'neutrino://settings') {
      window.dispatchEvent(new CustomEvent('neutrino:open-settings'));
      return;
    }
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
    setState((prev) => ({
      ...prev,
      activeTabId: tabId,
    }));
  }, []);

  const togglePinTab = useCallback((tabId: string) => {
    window.neutrino?.togglePinTab(tabId);
  }, []);

  const toggleSleepTab = useCallback((tabId: string) => {
    window.neutrino?.toggleSleepTab(tabId);
  }, []);

  const selectSpace = useCallback((spaceId: string) => {
    window.neutrino?.selectSpace(spaceId);
    setState((prev) => ({
      ...prev,
      activeSpaceId: spaceId,
    }));
  }, []);

  const createSpace = useCallback((name: string, color?: string) => {
    return window.neutrino?.createSpace?.(name, color);
  }, []);

  const deleteSpace = useCallback((spaceId: string) => {
    return window.neutrino?.deleteSpace?.(spaceId);
  }, []);

  const reorderTabs = useCallback((draggedTabId: string, targetTabId: string) => {
    return window.neutrino?.reorderTabs?.(draggedTabId, targetTabId);
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
    createSpace,
    deleteSpace,
    reorderTabs,
    toggleShields,
    zenOptimize,
  };
}

