import React, { useEffect, useState, useRef } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { useBrowser } from './hooks/useBrowser';
import { Sidebar } from './components/Sidebar';
import { BrowserViewport } from './components/BrowserViewport';
import { CommandBar } from './components/CommandBar';
import { ShieldModal } from './components/ShieldModal';
import { McpModal } from './components/McpModal';
import { ThemeCustomizerModal } from './components/ThemeCustomizerModal';
import { MediaPlayer } from './components/MediaPlayer';
import { PixelMcp, PixelPalette, PixelShield, PixelZen, PixelMoon, PixelSun } from './components/PixelIcons';
import { ActiveMediaState } from './types';
import './styles/theme.css';

export function App() {
  const {
    state,
    activeTab,
    currentSpaceTabs,
    blockedTrackers,
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
  } = useBrowser();

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [spaceOverlay, setSpaceOverlay] = useState<string | null>(null);
  const [spaceTransitionClass, setSpaceTransitionClass] = useState<string>('');

  // Persistent Dark Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('neutrino_dark_theme') === 'true';
    } catch {
      return false;
    }
  });

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('neutrino_dark_theme', next ? 'true' : 'false');
      } catch {}
      if (next) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.classList.add('dark-mode');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.classList.remove('dark-mode');
      }
      return next;
    });
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-mode');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  // Browser UI Scale state (persisted across sessions)
  const [browserZoom, setBrowserZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('neutrino_browser_zoom');
      return saved ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  });

  const [zoomNotification, setZoomNotification] = useState<string | null>(null);
  const zoomNotifTimer = useRef<any>(null);

  const notifyZoom = (msg: string) => {
    setZoomNotification(msg);
    if (zoomNotifTimer.current) clearTimeout(zoomNotifTimer.current);
    zoomNotifTimer.current = setTimeout(() => {
      setZoomNotification(null);
    }, 1800);
  };

  const changeBrowserZoom = (delta: number | 'reset') => {
    let next = 1.0;
    if (delta === 'reset') {
      next = 1.0;
    } else {
      next = Math.max(0.6, Math.min(2.5, Math.round((browserZoom + delta) * 100) / 100));
    }
    setBrowserZoom(next);
    try {
      localStorage.setItem('neutrino_browser_zoom', next.toString());
      document.documentElement.style.zoom = `${next}`;
      window.neutrino?.setBrowserZoom?.(next);
    } catch {
      // ignore
    }

    // Also scale active webview to match
    const webview: any = document.querySelector('.tab-webview-wrapper.active webview');
    if (webview?.setZoomFactor) {
      try {
        webview.setZoomFactor(next);
      } catch {
        // ignore
      }
    }
    if (activeTab) {
      handleUpdateTab(activeTab.id, { zoomFactor: next });
    }

    notifyZoom(`Browser Scale: ${Math.round(next * 100)}%`);
  };

  // Restore saved UI zoom on mount
  useEffect(() => {
    if (browserZoom) {
      document.documentElement.style.zoom = `${browserZoom}`;
      window.neutrino?.setBrowserZoom?.(browserZoom);
    }
  }, [browserZoom]);

  // Persistent Media Player state (PiP when backgrounded)
  const [activeMediaState, setActiveMediaState] = useState<ActiveMediaState | null>(null);
  const [mediaCommand, setMediaCommand] = useState<{
    action: string;
    tabId?: string;
    value?: number;
    timestamp: number;
  } | null>(null);

  // Fluid space switching animation (macOS-inspired desktop slide)
  const handleSelectSpace = (spaceId: string) => {
    if (spaceId === state.activeSpaceId) return;

    const currentIdx = state.spaces.findIndex((s) => s.id === state.activeSpaceId);
    const nextIdx = state.spaces.findIndex((s) => s.id === spaceId);
    const nextSpace = state.spaces.find((s) => s.id === spaceId);

    const dirClass = nextIdx >= currentIdx ? 'space-transition-left' : 'space-transition-right';
    setSpaceTransitionClass(dirClass);

    if (nextSpace) {
      setSpaceOverlay(nextSpace.name);
    }

    selectSpace(spaceId);

    setTimeout(() => {
      setSpaceTransitionClass('');
    }, 450);

    setTimeout(() => {
      setSpaceOverlay(null);
    }, 1100);
  };

  const handleCreateSpace = (name: string, color: string) => {
    createSpace(name, color);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+T or Ctrl+K -> Show Search / Command Palette
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('neutrino:show-search'));
        if (activeTab && activeTab.url && activeTab.url !== 'neutrino://newtab' && activeTab.url !== 'about:blank') {
          setIsCommandBarOpen(true);
        }
      }
      // Ctrl+W -> Close active tab
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (state.activeTabId) {
          closeTab(state.activeTabId);
        }
      }
      // Ctrl+S -> Toggle Arc Sidebar
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
      // Ctrl+1..4 -> Switch Spaces
      else if ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (state.spaces[idx]) {
          handleSelectSpace(state.spaces[idx].id);
        }
      }
      // Ctrl+- or Ctrl+_ -> Make browser smaller
      else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract' || (e as any).keyCode === 189 || (e as any).keyCode === 109)
      ) {
        e.preventDefault();
        changeBrowserZoom(-0.1);
      }
      // Ctrl+= or Ctrl++ -> Make browser bigger!
      else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd' || (e as any).keyCode === 187 || (e as any).keyCode === 107)
      ) {
        e.preventDefault();
        changeBrowserZoom(+0.1);
      }
      // Ctrl+0 -> Reset browser zoom to 100%
      else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0' || (e as any).keyCode === 48 || (e as any).keyCode === 96)
      ) {
        e.preventDefault();
        changeBrowserZoom('reset');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.activeTabId, state.spaces, activeTab, closeTab, handleSelectSpace, setIsCommandBarOpen, browserZoom]);

  // Listen for media commands from MCP or external calls
  useEffect(() => {
    const electron = (window as any).electron;
    if (electron?.ipcRenderer) {
      const handler = (_: any, cmd: any) => {
        setMediaCommand({ ...cmd, timestamp: Date.now() });
      };
      electron.ipcRenderer.on('neutrino:media-command', handler);
      return () => electron.ipcRenderer.removeListener('neutrino:media-command', handler);
    }
  }, []);

  const handleUpdateTab = (tabId: string, partial: Partial<TabState>) => {
    window.neutrino?.updateTab?.(tabId, partial);
  };

  const handleGoBack = () => {
    const webview: any = document.querySelector('webview.chromium-webview');
    if (webview?.canGoBack?.()) webview.goBack();
  };

  const handleGoForward = () => {
    const webview: any = document.querySelector('webview.chromium-webview');
    if (webview?.canGoForward?.()) webview.goForward();
  };

  const handleReload = () => {
    const webview: any = document.querySelector('webview.chromium-webview');
    if (webview?.reload) webview.reload();
  };

  // Media Controls
  const handleMediaPlayPause = () => {
    if (!activeMediaState) return;
    const action = activeMediaState.isPlaying ? 'pause' : 'play';
    setMediaCommand({ action, tabId: activeMediaState.tabId, timestamp: Date.now() });
    setActiveMediaState((prev) => (prev ? { ...prev, isPlaying: !prev.isPlaying } : null));
  };

  const handleMediaSeek = (time: number) => {
    if (!activeMediaState) return;
    setMediaCommand({ action: 'seek', tabId: activeMediaState.tabId, value: time, timestamp: Date.now() });
    setActiveMediaState((prev) => (prev ? { ...prev, currentTime: time } : null));
  };

  const handleMediaVolume = (vol: number) => {
    if (!activeMediaState) return;
    setMediaCommand({ action: 'volume', tabId: activeMediaState.tabId, value: vol, timestamp: Date.now() });
    setActiveMediaState((prev) => (prev ? { ...prev, volume: vol } : null));
  };

  const handleGoToMediaTab = (tabId: string) => {
    selectTab(tabId);
  };

  const handleCloseMediaPlayer = () => {
    if (activeMediaState) {
      setMediaCommand({ action: 'pause', tabId: activeMediaState.tabId, timestamp: Date.now() });
    }
    setActiveMediaState(null);
  };

  // Show mini player when media is playing in a tab that is NOT the active tab
  const shouldShowMiniPlayer =
    activeMediaState &&
    activeMediaState.isPlaying &&
    activeMediaState.tabId !== state.activeTabId;

  return (
    <div className="arc-app-shell">
      {/* Floating Browser Scale Notification */}
      {zoomNotification && (
        <div className="arc-browser-zoom-pill">
          <span>{zoomNotification}</span>
        </div>
      )}

      {/* Space Name Animation Overlay */}
      {spaceOverlay && (
        <div className="macos-space-name-overlay">
          <span className="macos-space-name-text">{spaceOverlay}</span>
        </div>
      )}

      {/* Top Right Controls: Shields, Zen, Dark Mode Toggle, AI Assistant & Theme Switcher */}
      <div className="arc-top-right-bar">
        {/* Shield Blocker Pill */}
        <button
          className="arc-top-right-pill-btn"
          onClick={() => setIsShieldModalOpen(!isShieldModalOpen)}
          title={`Shields active: ${state.shieldStats.trackersBlocked} blocked`}
          aria-label="Shields"
        >
          <PixelShield size={14} />
          <span className="arc-top-pill-badge">{state.shieldStats.trackersBlocked}</span>
        </button>

        {/* Zen Mode RAM Pill */}
        <button
          className="arc-top-right-pill-btn"
          onClick={zenOptimize}
          title={`Zen: ${state.resourceStats.memorySavedMb}MB RAM saved (click to optimize)`}
          aria-label="Zen Mode"
        >
          <PixelZen size={14} />
          <span className="arc-top-pill-badge">{state.resourceStats.memorySavedMb}M</span>
        </button>

        {/* Dark / Light Mode Toggle */}
        <button
          className="arc-top-right-btn"
          onClick={toggleDarkMode}
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label="Toggle Dark Mode"
        >
          {isDarkMode ? <PixelSun size={16} /> : <PixelMoon size={16} />}
        </button>

        {/* AI Assistant & Tools */}
        <button
          className="arc-top-right-btn"
          onClick={() => setIsMcpModalOpen(!isMcpModalOpen)}
          title="AI Assistants & Tools"
          aria-label="AI Assistants & Tools"
        >
          <PixelMcp size={16} />
        </button>

        {/* Themes & Appearance */}
        <button
          className="arc-top-right-btn"
          onClick={() => setIsThemeModalOpen(true)}
          title="Themes & Appearance"
          aria-label="Themes & Appearance"
        >
          <PixelPalette size={16} />
        </button>
      </div>

      {/* Arc Browser Vertical Sidebar */}
      {isSidebarOpen && (
        <Sidebar
          spaces={state.spaces}
          activeSpaceId={state.activeSpaceId}
          tabs={currentSpaceTabs}
          activeTabId={state.activeTabId}
          isOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(false)}
          onOpenCommandBar={() => setIsCommandBarOpen(true)}
          onOpenThemeStudio={() => setIsThemeModalOpen(true)}
          onToggleShieldModal={() => setIsShieldModalOpen(!isShieldModalOpen)}
          onToggleMcpModal={() => setIsMcpModalOpen(!isMcpModalOpen)}
          onZenOptimize={zenOptimize}
          shieldStats={state.shieldStats}
          resourceStats={state.resourceStats}
          activeTab={activeTab}
          onNavigate={navigate}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onReload={handleReload}
          onSelectTab={selectTab}
          onCloseTab={closeTab}
          onTogglePinTab={togglePinTab}
          onToggleSleepTab={toggleSleepTab}
          onSelectSpace={handleSelectSpace}
          onCreateTab={createTab}
          onCreateSpace={handleCreateSpace}
          onDeleteSpace={deleteSpace}
          onReorderTabs={reorderTabs}
        />
      )}

      {/* Main Browser Viewport Area (Arc Web Canvas) */}
      <main className={`arc-viewport-container ${spaceTransitionClass} ${isSidebarOpen ? 'with-sidebar' : 'collapsed-sidebar'}`}>
        {/* Floating Sidebar Toggle Button when sidebar is collapsed */}
        {!isSidebarOpen && (
          <button
            className="arc-floating-sidebar-trigger"
            onClick={() => setIsSidebarOpen(true)}
            title="Expand Sidebar (Ctrl+S)"
            aria-label="Expand Sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}

        {/* Real Chromium Webview Viewport Canvas */}
        <div className="arc-web-canvas-frame">
          <BrowserViewport
            activeTab={activeTab}
            tabs={state.tabs}
            spaces={state.spaces}
            activeSpaceId={state.activeSpaceId}
            isDarkMode={isDarkMode}
            isSidebarOpen={isSidebarOpen}
            onSelectSpace={handleSelectSpace}
            onUpdateTab={handleUpdateTab}
            onNavigate={navigate}
            onMediaStateChange={setActiveMediaState}
            mediaCommand={mediaCommand}
          />
        </div>
      </main>

      {/* Floating Media Player (PiP) */}
      {shouldShowMiniPlayer && (
        <MediaPlayer
          mediaState={activeMediaState}
          onPlayPause={handleMediaPlayPause}
          onSeek={handleMediaSeek}
          onVolume={handleMediaVolume}
          onGoToTab={handleGoToMediaTab}
          onClose={handleCloseMediaPlayer}
        />
      )}

      {/* Floating Command Bar (Ctrl+T / Ctrl+K) */}
      <CommandBar
        isOpen={isCommandBarOpen}
        tabs={state.tabs}
        spaces={state.spaces}
        onClose={() => setIsCommandBarOpen(false)}
        onNavigate={navigate}
        onSelectTab={selectTab}
        onCreateTab={createTab}
        onZenOptimize={zenOptimize}
        onToggleShields={toggleShields}
        onSelectSpace={handleSelectSpace}
        onOpenThemeStudio={() => setIsThemeModalOpen(true)}
      />

      {/* Shield Modal Flyout */}
      <ShieldModal
        isOpen={isShieldModalOpen}
        onClose={() => setIsShieldModalOpen(false)}
        stats={state.shieldStats}
        blockedItems={blockedTrackers}
        onToggleShields={toggleShields}
      />

      {/* MCP Drawer (Right-Side) */}
      <McpModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
        activeTab={activeTab}
        onNavigate={navigate}
      />

      {/* Theme Studio Modal */}
      <ThemeCustomizerModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />
    </div>
  );
}

export default App;
