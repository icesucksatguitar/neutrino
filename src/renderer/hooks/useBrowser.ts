import { useState, useEffect, useCallback } from 'react';
import type { BrowserAppState, BlockedTrackerItem, MoveOp, SidebarState, SpacePatch, TabState } from '../types';

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
      // Spaces come from the ProfileStore as-is: legacy ids (DEFAULT/PLAN/MAX) are already
      // migrated in main, and rewriting them here would undo user renames and drop `profileId`.
      const spaces = newState.spaces || [];
      setState({
        ...newState,
        spaces: spaces.length > 0 ? spaces : INITIAL_STATE.spaces,
        activeSpaceId: newState.activeSpaceId || spaces[0]?.id || INITIAL_STATE.activeSpaceId,
      });
    });

    // A tab moved to another profile's space reloads in that profile's session (R1.12, R17.5).
    // The state-update that follows carries the same partition; applying it now lets the
    // webview remount without waiting for it.
    const unregPartition = window.neutrino.onTabPartitionChanged?.(({ tabId, partition, url }) => {
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === tabId ? { ...t, partition, url } : t)),
      }));
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
    }).catch(() => { });

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
      unregPartition?.();
      unregTracker?.();
      window.removeEventListener('neutrino:mock-tabs', handleMockTabs);
    };
  }, []);

  const navigate = useCallback((url: string) => {
    if (typeof url === 'string') {
      const normalized = url.trim().toLowerCase();
      // neutrino://settings, neutrino://history, neutrino://vpn open panels without changing Active_Tab URL.
      if (normalized === 'neutrino://settings') {
        window.dispatchEvent(new CustomEvent('neutrino:open-settings'));
        return;
      }
      if (normalized === 'neutrino://history') {
        window.dispatchEvent(new CustomEvent('neutrino:open-history'));
        return;
      }
      if (normalized === 'neutrino://vpn') {
        window.dispatchEvent(new CustomEvent('neutrino:open-vpn'));
        return;
      }
    }
    window.neutrino?.navigate(url);
  }, []);

  const createTab = useCallback((url?: string, spaceId?: string) => {
    return window.neutrino?.createTab(url, spaceId);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    window.neutrino?.closeTab(tabId);
  }, []);

  const reopenClosedTab = useCallback(() => {
    return window.neutrino?.reopenClosedTab?.();
  }, []);

  const cycleTab = useCallback((direction: 1 | -1) => {
    return window.neutrino?.cycleTab?.(direction);
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

  const createSpace = useCallback((name: string, color?: string, profileId?: string) => {
    return window.neutrino?.createSpace?.(name, color, profileId);
  }, []);

  const deleteSpace = useCallback((spaceId: string) => {
    return window.neutrino?.deleteSpace?.(spaceId);
  }, []);

  const updateSpace = useCallback((spaceId: string, patch: SpacePatch) => {
    return window.neutrino?.updateSpace?.(spaceId, patch);
  }, []);

  const reorderSpace = useCallback((spaceId: string, toIndex: number) => {
    return window.neutrino?.reorderSpace?.(spaceId, toIndex);
  }, []);

  const moveTab = useCallback((op: MoveOp) => {
    return window.neutrino?.moveTab?.(op);
  }, []);

  const pinTab = useCallback((tabId: string) => {
    return window.neutrino?.pinTab?.(tabId);
  }, []);

  const unpinTab = useCallback((tabId: string) => {
    return window.neutrino?.unpinTab?.(tabId);
  }, []);

  const addFavorite = useCallback((tabId: string) => {
    return window.neutrino?.addFavorite?.(tabId);
  }, []);

  const removeFavorite = useCallback((favoriteId: string) => {
    return window.neutrino?.removeFavorite?.(favoriteId);
  }, []);

  const duplicateTab = useCallback((id: string, spaceId?: string) => {
    return window.neutrino?.duplicateTab?.(id, spaceId);
  }, []);

  const updateSidebarState = useCallback((patch: Partial<SidebarState>) => {
    return window.neutrino?.updateSidebarState?.(patch);
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

  // Favorites are shared by every space of the active space's owning profile (R14.2).
  const activeSpaceProfileId =
    state.spaces.find((s) => s.id === state.activeSpaceId)?.profileId ?? state.activeProfileId;
  const currentFavorites = (state.favorites ?? [])
    .filter((f) => f.profileId === activeSpaceProfileId)
    .sort((a, b) => a.order - b.order);

  return {
    state,
    activeTab,
    currentSpaceTabs,
    currentFavorites,
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
    reopenClosedTab,
    cycleTab,
    selectTab,
    togglePinTab,
    toggleSleepTab,
    selectSpace,
    createSpace,
    deleteSpace,
    updateSpace,
    reorderSpace,
    reorderTabs,
    moveTab,
    pinTab,
    unpinTab,
    addFavorite,
    removeFavorite,
    duplicateTab,
    updateSidebarState,
    toggleShields,
    zenOptimize,
  };
}

