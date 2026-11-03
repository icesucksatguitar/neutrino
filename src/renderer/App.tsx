import React, { useEffect, useState } from 'react';
import { useBrowser } from './hooks/useBrowser';
import { Sidebar } from './components/Sidebar';
import { Omnibox } from './components/Omnibox';
import { BrowserViewport } from './components/BrowserViewport';
import { CommandBar } from './components/CommandBar';
import { ShieldModal } from './components/ShieldModal';
import { McpModal } from './components/McpModal';
import { ThemeCustomizerModal } from './components/ThemeCustomizerModal';
import { MediaPlayer } from './components/MediaPlayer';
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
    toggleShields,
    zenOptimize,
  } = useBrowser();

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isTabsOpen, setIsTabsOpen] = useState(false);
  const [spaceOverlay, setSpaceOverlay] = useState<string | null>(null);
  const [spaceTransitionClass, setSpaceTransitionClass] = useState<string>('');

  // 8. Persistent Media Player state (PiP when backgrounded)
  const [activeMediaState, setActiveMediaState] = useState<ActiveMediaState | null>(null);
  const [mediaCommand, setMediaCommand] = useState<{
    action: string;
    tabId?: string;
    value?: number;
    timestamp: number;
  } | null>(null);

  // Fluid space switching animation
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+T or Ctrl+K -> Command Palette / New Tab
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setIsCommandBarOpen(true);
      }
      // Ctrl+W -> Close active tab
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (state.activeTabId) {
          closeTab(state.activeTabId);
        }
      }
      // Ctrl+S -> Toggle Tabs Drawer
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsTabsOpen((prev) => !prev);
      }
      // Ctrl+1..4 -> Switch Spaces
      else if ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (state.spaces[idx]) {
          handleSelectSpace(state.spaces[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.activeTabId, state.spaces, closeTab, handleSelectSpace, setIsCommandBarOpen]);

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

  const handleUpdateTab = () => {
    // updates from webview
  };

  const handleGoBack = () => {
    const webview: any = document.querySelector('webview');
    if (webview?.canGoBack?.()) webview.goBack();
  };

  const handleGoForward = () => {
    const webview: any = document.querySelector('webview');
    if (webview?.canGoForward?.()) webview.goForward();
  };

  const handleReload = () => {
    const webview: any = document.querySelector('webview');
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

  // Show mini player when media is playing in a tab that is NOT the currently active tab (Section 8)
  const shouldShowMiniPlayer =
    activeMediaState &&
    activeMediaState.isPlaying &&
    activeMediaState.tabId !== state.activeTabId;

  return (
    <div className="app-container">
      {/* Space Name Animation Overlay */}
      {spaceOverlay && (
        <div className="macos-space-name-overlay">
          <span className="macos-space-name-text">{spaceOverlay}</span>
        </div>
      )}

      {/* Floating Lightweight Tabs Drawer (Left, 280px, Light Theme, Section 6) */}
      <Sidebar
        spaces={state.spaces}
        activeSpaceId={state.activeSpaceId}
        tabs={currentSpaceTabs}
        activeTabId={state.activeTabId}
        isOpen={isTabsOpen}
        onClose={() => setIsTabsOpen(false)}
        onOpenCommandBar={() => setIsCommandBarOpen(true)}
        onOpenThemeStudio={() => setIsThemeModalOpen(true)}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
        onTogglePinTab={togglePinTab}
        onToggleSleepTab={toggleSleepTab}
        onSelectSpace={handleSelectSpace}
        onCreateTab={createTab}
      />

      {/* Main Browser Viewport Area */}
      <main className={`main-viewport ${spaceTransitionClass}`}>
        {/* Omnibox / Top Navigation Bar (Light Theme) */}
        <Omnibox
          activeTab={activeTab}
          shieldStats={state.shieldStats}
          resourceStats={state.resourceStats}
          isTabsOpen={isTabsOpen}
          onToggleTabs={() => setIsTabsOpen(!isTabsOpen)}
          onNavigate={navigate}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onReload={handleReload}
          onToggleShieldModal={() => setIsShieldModalOpen(!isShieldModalOpen)}
          onToggleMcpModal={() => setIsMcpModalOpen(!isMcpModalOpen)}
          onToggleThemeModal={() => setIsThemeModalOpen(true)}
          onZenOptimize={zenOptimize}
        />

        {/* Real Chromium Webview Viewport (Preserves background tabs with media alive, Section 8) */}
        <BrowserViewport
          activeTab={activeTab}
          tabs={state.tabs}
          spaces={state.spaces}
          activeSpaceId={state.activeSpaceId}
          onSelectSpace={handleSelectSpace}
          onUpdateTab={handleUpdateTab}
          onNavigate={navigate}
          onMediaStateChange={setActiveMediaState}
          mediaCommand={mediaCommand}
        />
      </main>

      {/* 8. Persistent Floating Media Player (PiP, draggable, resizable, corner-snapping) */}
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

      {/* Brave-style Shield Modal Flyout (Light Theme) */}
      <ShieldModal
        isOpen={isShieldModalOpen}
        onClose={() => setIsShieldModalOpen(false)}
        stats={state.shieldStats}
        blockedItems={blockedTrackers}
        onToggleShields={toggleShields}
      />

      {/* 7. Redesigned MCP Panel Right-Side Drawer (Assistants, Local models, Tools) */}
      <McpModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
        activeTab={activeTab}
        onNavigate={navigate}
      />

      {/* Theme Customizer Modal */}
      <ThemeCustomizerModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />
    </div>
  );
}

export default App;
