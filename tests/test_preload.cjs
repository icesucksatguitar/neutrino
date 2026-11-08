const { contextBridge } = require('electron');

let stateCb = null;
let currentState = {
  spaces: [
    { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
    { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' },
    { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' }
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
      blockedCount: 0
    }
  ],
  activeTabId: 'tab-init',
  shieldStats: { totalBlocked: 0, adsBlocked: 0, trackersBlocked: 0, analyticsBlocked: 0, fingerprintersBlocked: 0, dataSavedKb: 0 },
  resourceStats: { memorySavedMb: 0, sleepingCount: 0 }
};

contextBridge.exposeInMainWorld('neutrino', {
  isElectron: true,
  onStateUpdate: (cb) => {
    stateCb = cb;
    setTimeout(() => cb(currentState), 50);
  },
  navigate: (url) => {
    currentState = {
      ...currentState,
      tabs: [
        {
          id: 'tab-site',
          spaceId: currentState.activeSpaceId,
          title: 'Wikipedia, the free encyclopedia',
          url: url,
          isLoading: false,
          canGoBack: true,
          canGoForward: false,
          isPinned: false,
          isSleeping: false,
          blockedCount: 5
        }
      ],
      activeTabId: 'tab-site'
    };
    if (stateCb) stateCb(currentState);
  },
  createTab: (url = 'neutrino://newtab', spaceId) => {
    const id = 'tab-' + Math.random().toString(36).substring(7);
    currentState = {
      ...currentState,
      tabs: [
        ...currentState.tabs,
        { id, spaceId: spaceId || currentState.activeSpaceId, title: 'New Tab', url, isLoading: false }
      ],
      activeTabId: id
    };
    if (stateCb) stateCb(currentState);
  },
  selectTab: (tabId) => {
    currentState = { ...currentState, activeTabId: tabId };
    if (stateCb) stateCb(currentState);
  },
  closeTab: (tabId) => {
    const remaining = currentState.tabs.filter(t => t.id !== tabId);
    currentState = {
      ...currentState,
      tabs: remaining.length > 0 ? remaining : [{ id: 'tab-init', spaceId: currentState.activeSpaceId, title: 'New Tab', url: 'neutrino://newtab' }],
      activeTabId: remaining.length > 0 ? remaining[0].id : 'tab-init'
    };
    if (stateCb) stateCb(currentState);
  },
  selectSpace: (spaceId) => {
    currentState = { ...currentState, activeSpaceId: spaceId };
    if (stateCb) stateCb(currentState);
  },
  windowControl: (act) => console.log('windowControl:', act),
  toggleShields: () => {},
  zenOptimize: () => {},
  getShieldStats: () => Promise.resolve({ totalBlocked: 0 }),
  callMcp: () => Promise.resolve({}),
  getMcpLogs: () => Promise.resolve([]),
  mediaControl: () => {},
  captureTabPreview: () => Promise.resolve(''),
  setZoomFactor: () => {},
  onZoomUpdated: () => () => {},
  onCloseActiveTab: () => () => {},
  onOpenCommandBar: () => () => {},
  onTrackerBlocked: () => () => {},
});