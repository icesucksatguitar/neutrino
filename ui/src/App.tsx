import { useState, useEffect } from 'react';
import { Tab, BrowserSettings } from './types/browser';
import { TabStrip } from './components/TabStrip';
import { NavigationBar } from './components/NavigationBar';
import { Viewport } from './components/Viewport';
import { ShieldModal } from './components/ShieldModal';
import { SettingsModal } from './components/SettingsModal';
import { useNativeBridge } from './hooks/useNativeBridge';

const INITIAL_SETTINGS: BrowserSettings = {
  searchEngine: 'DuckDuckGo',
  shieldsActive: true,
  strictFingerprinting: true,
  blockWebRTCLeaks: true,
  dohProvider: 'https://cloudflare-dns.com/dns-query',
  autoCleanUtmParams: true,
  theme: 'dark',
};

const INITIAL_TABS: Tab[] = [
  {
    id: 'tab-1',
    title: 'New Tab',
    url: 'neutrino://newtab',
    isLoading: false,
    isPinned: false,
    isMuted: false,
    container: 'default',
    blockedTrackersCount: 0,
  },
];

export function App() {
  const [tabs, setTabs] = useState<Tab[]>(INITIAL_TABS);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [settings, setSettings] = useState<BrowserSettings>(INITIAL_SETTINGS);
  const [isShieldModalOpen, setIsShieldModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // History stack for back/forward
  const [historyStack, setHistoryStack] = useState<string[]>(['neutrino://newtab']);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const { isConnected, stats, blockedItems, checkUrl, cleanUrl } = useNativeBridge();

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Navigate current active tab
  const handleNavigate = (rawUrl: string) => {
    let finalUrl = rawUrl;
    if (settings.autoCleanUtmParams) {
      finalUrl = cleanUrl(rawUrl);
    }

    // Inspect URL with native filter engine
    const checkResult = checkUrl(finalUrl);

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id === activeTabId) {
          return {
            ...tab,
            url: finalUrl,
            title: finalUrl.startsWith('http')
              ? new URL(finalUrl).hostname
              : finalUrl === 'neutrino://newtab'
              ? 'New Tab'
              : finalUrl,
            isLoading: true,
            blockedTrackersCount: checkResult.blocked
              ? tab.blockedTrackersCount + 1
              : tab.blockedTrackersCount,
          };
        }
        return tab;
      })
    );

    // Update history
    const nextStack = historyStack.slice(0, historyIndex + 1);
    nextStack.push(finalUrl);
    setHistoryStack(nextStack);
    setHistoryIndex(nextStack.length - 1);

    // Simulate page load completion
    setTimeout(() => {
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? { ...tab, isLoading: false } : tab))
      );
    }, 600);
  };

  const handleGoBack = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      const url = historyStack[prevIdx];
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? { ...tab, url, title: url } : tab))
      );
    }
  };

  const handleGoForward = () => {
    if (historyIndex < historyStack.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      const url = historyStack[nextIdx];
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? { ...tab, url, title: url } : tab))
      );
    }
  };

  const handleReload = () => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === activeTabId ? { ...tab, isLoading: true } : tab))
    );
    setTimeout(() => {
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? { ...tab, isLoading: false } : tab))
      );
    }, 500);
  };

  const handleNewTab = (container: Tab['container'] = 'default') => {
    const newId = `tab-${Date.now()}`;
    const newTab: Tab = {
      id: newId,
      title: 'New Tab',
      url: 'neutrino://newtab',
      isLoading: false,
      isPinned: false,
      isMuted: false,
      container,
      blockedTrackersCount: 0,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (idToClose: string) => {
    if (tabs.length === 1) {
      // Keep at least one tab
      handleNavigate('neutrino://newtab');
      return;
    }

    const idx = tabs.findIndex((t) => t.id === idToClose);
    const remaining = tabs.filter((t) => t.id !== idToClose);
    setTabs(remaining);

    if (activeTabId === idToClose) {
      const nextActive = remaining[Math.max(0, idx - 1)];
      setActiveTabId(nextActive.id);
    }
  };

  const handleToggleMute = (id: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isMuted: !t.isMuted } : t))
    );
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleNewTab();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handleCloseTab(activeTabId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleReload();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, tabs]);

  const activeHost =
    activeTab.url && activeTab.url.startsWith('http')
      ? new URL(activeTab.url).hostname
      : 'neutrino://newtab';

  return (
    <div className={`browser-app ${settings.theme}`}>
      {/* Top Window Bar: Tabs */}
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onNewTab={() => handleNewTab('default')}
        onToggleMute={handleToggleMute}
      />

      {/* Navigation & Omnibox Bar */}
      <NavigationBar
        currentUrl={activeTab.url}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < historyStack.length - 1}
        isLoading={activeTab.isLoading}
        blockedCount={activeTab.blockedTrackersCount || stats.totalBlocked}
        settings={settings}
        onNavigate={handleNavigate}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        onGoHome={() => handleNavigate('neutrino://newtab')}
        onToggleShieldModal={() => setIsShieldModalOpen(!isShieldModalOpen)}
        onToggleSettingsModal={() => setIsSettingsModalOpen(!isSettingsModalOpen)}
      />

      {/* Active Content Viewport */}
      <Viewport
        activeTab={activeTab}
        stats={stats}
        searchEngine={settings.searchEngine}
        onNavigate={handleNavigate}
        onReload={handleReload}
      />

      {/* Privacy Shield Flyout Modal */}
      <ShieldModal
        isOpen={isShieldModalOpen}
        onClose={() => setIsShieldModalOpen(false)}
        currentHost={activeHost}
        stats={stats}
        blockedItems={blockedItems}
        settings={settings}
        onToggleShields={() =>
          setSettings((prev) => ({ ...prev, shieldsActive: !prev.shieldsActive }))
        }
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={(newOpts) => setSettings((prev) => ({ ...prev, ...newOpts }))}
        isNativeConnected={isConnected}
      />
    </div>
  );
}

export default App;
