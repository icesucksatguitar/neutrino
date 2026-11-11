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

    const applyIncomingState = (newState: BrowserAppState) => {
      const normalizedSpaces = (newState.spaces || []).map((sp) => {
        if (sp.id === 'space-default' || sp.id === 'space-study' || (!sp.id?.startsWith('space-') && sp.name === 'DEFAULT')) {
          return { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' };
        }
        if (sp.id === 'space-plan' || sp.id === 'space-work' || (!sp.id?.startsWith('space-') && sp.name === 'PLAN')) {
          return { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' };
        }
        if (sp.id === 'space-max' || sp.id === 'space-leisure' || (!sp.id?.startsWith('space-') && sp.name === 'MAX')) {
          return { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' };
        }
        return sp;
      });

      let activeSp = newState.activeSpaceId;
      if (activeSp === 'space-default') activeSp = 'space-study';
      if (activeSp === 'space-plan') activeSp = 'space-work';
      if (activeSp === 'space-max') activeSp = 'space-leisure';

      const finalSpaces = normalizedSpaces.length > 0 ? normalizedSpaces : INITIAL_STATE.spaces;
      setState({
        ...newState,
        spaces: finalSpaces,
        activeSpaceId: activeSp || finalSpaces[0]?.id || 'space-study',
      });
    };

    const unregState = window.neutrino.onStateUpdate(applyIncomingState);

    window.neutrino.getState?.().then((initial) => {
      if (initial && Array.isArray(initial.spaces)) {
        applyIncomingState(initial);
      }
    }).catch(() => { });

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

  const createSpace = useCallback(async (name: string, color?: string) => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) return null;

    if (window.neutrino?.createSpace) {
      const created = await window.neutrino.createSpace(trimmed, color);
      if (created) {
        setState((prev) => ({
          ...prev,
          spaces: prev.spaces.some((s) => s.id === created.id) ? prev.spaces : [...prev.spaces, created],
          activeSpaceId: created.id,
        }));
      }
      return created ?? null;
    }

    const newSpace = {
      id: `space-local-${Date.now().toString(36)}`,
      name: trimmed,
      icon: 'Sparkles',
      color: color || '#8B5CF6',
    };
    const newTabId = `tab-local-${Date.now().toString(36)}`;
    setState((prev) => ({
      ...prev,
      spaces: [...prev.spaces, newSpace],
      activeSpaceId: newSpace.id,
      tabs: [
        ...prev.tabs,
        {
          id: newTabId,
          spaceId: newSpace.id,
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
      activeTabId: newTabId,
    }));
    return newSpace;
  }, []);

  const deleteSpace = useCallback(async (spaceId: string) => {
    if (window.neutrino?.deleteSpace) {
      return window.neutrino.deleteSpace(spaceId);
    }
    setState((prev) => {
      if (prev.spaces.length <= 1) return prev;
      const nextSpaces = prev.spaces.filter((s) => s.id !== spaceId);
      const nextTabs = prev.tabs.filter((t) => t.spaceId !== spaceId);
      const nextActiveSpaceId = prev.activeSpaceId === spaceId ? nextSpaces[0].id : prev.activeSpaceId;
      const nextActiveSpaceTabs = nextTabs.filter((t) => t.spaceId === nextActiveSpaceId);
      return {
        ...prev,
        spaces: nextSpaces,
        tabs: nextTabs,
        activeSpaceId: nextActiveSpaceId,
        activeTabId: prev.activeSpaceId === spaceId ? (nextActiveSpaceTabs[0]?.id ?? null) : prev.activeTabId,
      };
    });
    return true;
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
    reopenClosedTab,
    cycleTab,
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

