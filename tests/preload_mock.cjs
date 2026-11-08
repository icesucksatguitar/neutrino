let stateListeners = [];
let currentState = {
  tabs: [
    {
      id: 'tab-1',
      url: 'neutrino://newtab',
      title: 'New Tab',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isPinned: false,
      isSleeping: false,
      blockedCount: 0,
      spaceId: 'space-study',
    },
  ],
  spaces: [
    { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
    { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' },
    { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' },
  ],
  activeTabId: 'tab-1',
  activeSpaceId: 'space-study',
  shieldStats: { totalBlocked: 0, adsBlocked: 0, trackersBlocked: 0, analyticsBlocked: 0, fingerprintersBlocked: 0, dataSavedKb: 0 },
  resourceStats: { memorySavedMb: 0, sleepingCount: 0 },
};

window.neutrino = {
  onStateUpdate: (cb) => {
    stateListeners.push(cb);
    cb(currentState);
    return () => {
      stateListeners = stateListeners.filter((l) => l !== cb);
    };
  },
  emitState: (updater) => {
    if (typeof updater === 'function') {
      currentState = updater(currentState);
    } else {
      currentState = { ...currentState, ...updater };
    }
    stateListeners.forEach((cb) => cb(currentState));
  },
  toggleSleepTab: (tabId) => {
    currentState.tabs = currentState.tabs.map((t) => {
      if (t.id === tabId) {
        return { ...t, isSleeping: !t.isSleeping };
      }
      return t;
    });
    stateListeners.forEach((cb) => cb(currentState));
  },
  navigate: (url) => {
    currentState.tabs = currentState.tabs.map((t) => {
      if (t.id === currentState.activeTabId) {
        return { ...t, url, title: url };
      }
      return t;
    });
    stateListeners.forEach((cb) => cb(currentState));
  },
  selectTab: (tabId) => {
    currentState.activeTabId = tabId;
    stateListeners.forEach((cb) => cb(currentState));
  },
  createTab: (url, spaceId) => {
    const id = 'tab-' + Date.now();
    const newTab = {
      id,
      url: url || 'neutrino://newtab',
      title: 'New Tab',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isPinned: false,
      isSleeping: false,
      blockedCount: 0,
      spaceId: spaceId || 'space-study',
    };
    currentState.tabs.push(newTab);
    currentState.activeTabId = id;
    stateListeners.forEach((cb) => cb(currentState));
    return newTab;
  },
  closeTab: () => {},
  minimize: () => {},
  maximize: () => {},
  close: () => {},
  zenOptimize: () => {},
  toggleShields: () => {},
};
