import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useBrowser } from './hooks/useBrowser';
import { NotificationTabs } from './components/NotificationTabs';
import { FloatingUrlPill } from './components/FloatingUrlPill';
import { BrowserViewport } from './components/BrowserViewport';
import { CommandBar } from './components/CommandBar';
import { ShieldModal } from './components/ShieldModal';
import { McpModal } from './components/McpModal';
import { ThemeCustomizerModal } from './components/ThemeCustomizerModal';
import { MediaPlayer } from './components/MediaPlayer';
import { WelcomeModal, UserProfile } from './components/WelcomeModal';
import { StartupSplash } from './components/StartupSplash';
import { RightPinsDock } from './components/RightPinsDock';
import { SettingsPanel } from './components/SettingsPanel';
import { useSettings } from './hooks/useSettings';
import { isHostExcluded, toggleSiteExclusion } from '../main/settings';
import { Shield, Moon, Sun, Sparkles, Palette, Settings } from 'lucide-react';
import { TabState, ActiveMediaState } from './types';
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

  const { settings, updateSettings } = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isNotificationTabsOpen, setIsNotificationTabsOpen] = useState(false);
  const [isStartingUp, setIsStartingUp] = useState(true);
  const [spaceOverlay, setSpaceOverlay] = useState<string | null>(null);
  const [spaceTransitionClass, setSpaceTransitionClass] = useState<string>('');

  // User Profile & First Launch Welcome Screen State
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('neutrino_user_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isWelcomeOpen, setIsWelcomeOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('neutrino_onboarding_completed') === null;
    } catch {
      return false;
    }
  });

  const handleWelcomeComplete = (profile: UserProfile) => {
    setUserProfile(profile);
    setIsWelcomeOpen(false);
  };

  // Display name edited in the Settings panel; same key and shape WelcomeModal writes.
  const handleUserNameChange = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setUserProfile((prev) => {
      const base: UserProfile = prev ?? {
        name: trimmed,
        email: null,
        isGuest: true,
        theme: 'obsidian',
        mode: 'minimal',
      };
      const next: UserProfile = { ...base, name: trimmed };
      try {
        localStorage.setItem('neutrino_user_profile', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Automated background memory compression (Zen backend); skipped while Zen auto-sleep is off.
  // Manual Zen commands (Command Bar) call zenOptimize directly and are unaffected.
  const zenSleepEnabled = settings.zenSleepEnabled;
  useEffect(() => {
    if (!zenSleepEnabled) return;
    const interval = setInterval(() => {
      zenOptimize();
    }, 180000);
    return () => clearInterval(interval);
  }, [zenOptimize, zenSleepEnabled]);

  // Active webpage detection: on web pages, the viewport is pulled down below the 44px top header
  // so window controls, tabs, and site navigation controls never collide.
  const isWebpage = Boolean(
    activeTab?.url &&
    activeTab.url !== 'neutrino://newtab' &&
    activeTab.url !== 'about:blank' &&
    !activeTab.isSleeping
  );
  const [isHtmlFullscreen, setIsHtmlFullscreen] = useState(false);

  const shouldShowTopBar = !isHtmlFullscreen;

  // Persistent Dark Theme state (default dark mode per brief: #0A0A0B)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('neutrino_dark_theme');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  // Persist and apply a theme mode; shared by the top-bar toggle, Command Bar and Settings panel.
  const applyDarkModeSideEffects = (next: boolean) => {
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
  };

  const setDarkMode = useCallback((next: boolean) => {
    applyDarkModeSideEffects(next);
    setIsDarkMode(next);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      applyDarkModeSideEffects(next);
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
    window.neutrino?.setThemeMode?.(isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Clean up any legacy zoom locks or bad themes
  useEffect(() => {
    try {
      localStorage.removeItem('neutrino_browser_zoom');
      localStorage.removeItem('neutrino_homescreen_scale');
      const savedTheme = localStorage.getItem('neutrino_simple_theme_v5');
      if (savedTheme) {
        try {
          const parsed = JSON.parse(savedTheme);
          if (parsed.accent && parsed.accent !== '#FFFFFF' && parsed.accent !== '#1C1917' && parsed.accent !== '#E4E4E7' && parsed.accent !== '#71717A') {
            localStorage.removeItem('neutrino_simple_theme_v5');
          }
        } catch {
          localStorage.removeItem('neutrino_simple_theme_v5');
        }
      }
      document.documentElement.style.zoom = '';
    } catch {}
  }, []);

  // Persistent Media Player state (PiP when backgrounded)
  const [activeMediaState, setActiveMediaState] = useState<ActiveMediaState | null>(null);
  const [mediaCommand, setMediaCommand] = useState<{
    action: string;
    tabId?: string;
    value?: number;
    timestamp: number;
  } | null>(null);
  const dismissedMediaTabsRef = useRef<Set<string>>(new Set());

  // MCP Initial Tab state
  const [mcpInitialTab, setMcpInitialTab] = useState<'assistants' | 'local' | 'tools'>('assistants');

  // Media state change with dismissal memory to prevent unwanted popups
  const handleMediaStateChange = useCallback((newState: ActiveMediaState | null) => {
    if (newState && dismissedMediaTabsRef.current.has(newState.tabId)) {
      return;
    }
    setActiveMediaState(newState);
  }, []);

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

  // Keyboard shortcuts & events
  useEffect(() => {
    const handleOpenCommandBar = () => setIsCommandBarOpen(true);
    const handleCloseCommandBar = () => setIsCommandBarOpen(false);
    const handleToggleTabs = (e: any) => {
      const open = e?.detail?.open;
      setIsNotificationTabsOpen(prev => typeof open === 'boolean' ? open : !prev);
    };
    const handleCloseActiveTab = () => {
      if (state.activeTabId) {
        closeTab(state.activeTabId);
      }
    };

    // Native Electron IPC listeners (works from webviews & OS level)
    const unsubIpcToggle = window.neutrino?.onToggleTabs?.(() => {
      setIsNotificationTabsOpen((prev) => !prev);
    });
    const unsubIpcClose = window.neutrino?.onCloseActiveTab?.(() => {
      if (state.activeTabId) {
        closeTab(state.activeTabId);
      }
    });
    const unsubIpcCmd = window.neutrino?.onOpenCommandBar?.(() => {
      setIsCommandBarOpen(true);
    });
    const unsubIpcEsc = window.neutrino?.onEscapePressed?.(() => {
      setIsNotificationTabsOpen(false);
      setIsCommandBarOpen(false);
      setIsSettingsOpen(false);
    });
    // Ctrl+Comma while a webview has focus (main process before-input-event)
    const unsubIpcSettings = window.neutrino?.onOpenSettings?.(() => {
      setIsSettingsOpen(true);
    });
    // neutrino://settings from useBrowser.navigate
    const handleOpenSettingsEvent = () => setIsSettingsOpen(true);

    window.addEventListener('neutrino:open-settings', handleOpenSettingsEvent);
    window.addEventListener('neutrino:open-command-bar', handleOpenCommandBar);
    window.addEventListener('neutrino:close-command-bar', handleCloseCommandBar);
    window.addEventListener('neutrino:toggle-tabs', handleToggleTabs);
    window.addEventListener('neutrino:close-active-tab', handleCloseActiveTab);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+1..4 -> Switch Spaces
      if ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (state.spaces[idx]) {
          handleSelectSpace(state.spaces[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      unsubIpcToggle?.();
      unsubIpcClose?.();
      unsubIpcCmd?.();
      unsubIpcEsc?.();
      unsubIpcSettings?.();
      window.removeEventListener('neutrino:open-settings', handleOpenSettingsEvent);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('neutrino:open-command-bar', handleOpenCommandBar);
      window.removeEventListener('neutrino:close-command-bar', handleCloseCommandBar);
      window.removeEventListener('neutrino:toggle-tabs', handleToggleTabs);
      window.removeEventListener('neutrino:close-active-tab', handleCloseActiveTab);
    };
  }, [state.activeTabId, state.spaces, activeTab, closeTab, handleSelectSpace, setIsCommandBarOpen]);

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
      dismissedMediaTabsRef.current.add(activeMediaState.tabId);
      try {
        setMediaCommand({ action: 'pause', tabId: activeMediaState.tabId, timestamp: Date.now() });
      } catch {}
    }
    setActiveMediaState(null);
  };

  // Global Capturing Keyboard Shortcuts (Ctrl+W, Ctrl+T, Ctrl+K, Ctrl+L, Ctrl+E, Ctrl+R)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'w') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (state.activeTabId) {
            closeTab(state.activeTabId);
          }
        } else if (key === 't') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          createTab('neutrino://newtab', state.activeSpaceId);
          setIsCommandBarOpen(true);
        } else if (key === 'k' || key === 'l') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setIsCommandBarOpen((prev) => !prev);
        } else if (key === 'e') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setIsNotificationTabsOpen((prev) => !prev);
        } else if (key === 'r') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          window.neutrino?.reload();
        } else if (key === ',') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setIsCommandBarOpen(false);
          setIsSettingsOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [state.activeTabId, state.activeSpaceId, closeTab, createTab]);

  // Dark-mode exclusion for the Active_Tab host (Command Bar "Toggle Dark Mode for This Site")
  const activeTabUrl = activeTab?.url;
  const isActiveSiteExcluded = activeTabUrl
    ? isHostExcluded(activeTabUrl, settings.darkModeExclusions)
    : false;
  const handleToggleSiteDarkMode = useCallback(() => {
    if (!activeTabUrl) return;
    updateSettings({
      darkModeExclusions: toggleSiteExclusion(settings.darkModeExclusions, activeTabUrl),
    });
  }, [activeTabUrl, settings.darkModeExclusions, updateSettings]);

  const shieldsBlockedCount =
    state.shieldStats.totalBlocked || (state.shieldStats.trackersBlocked + state.shieldStats.adsBlocked);

  const shouldShowMiniPlayer =
    activeMediaState &&
    activeMediaState.isPlaying &&
    activeMediaState.tabId !== state.activeTabId;

  return (
    <div className="arc-app-shell radical-minimalism-shell">
      {/* Frameless Top Drag Bar */}
      {!isHtmlFullscreen && (
        <div className={`macos-window-drag-bar ${isWebpage ? 'on-webpage' : ''}`} />
      )}

      {/* Left Edge Hover Trigger (Opens tab panel from any site or blank page) */}
      <div
        className="left-edge-hover-zone"
        onMouseEnter={() => setIsNotificationTabsOpen(true)}
      />

      {/* Space Name Animation Overlay */}
      {spaceOverlay && (
        <div className="macos-space-name-overlay">
          <span className="macos-space-name-text">{spaceOverlay}</span>
        </div>
      )}

      {/* Top Chrome Header Bar (Solid dedicated header on web pages, floating on newtab) */}
      <div
        className={`floating-top-chrome-capsule ${isWebpage ? 'on-webpage' : ''} ${shouldShowTopBar ? 'visible' : 'autohidden'}`}
      >
        {/* Top Left: macOS Frameless Window Controls & Tabs Switcher (Opaque) */}
        <aside className="macos-window-controls-cluster" aria-label="Window Controls">
          <div className="macos-traffic-lights">
            <button
              className="traffic-light close"
              onClick={() => window.neutrino?.windowControl('close')}
              title="Close"
              aria-label="Close"
            >
              <span className="traffic-glyph">✕</span>
            </button>
            <button
              className="traffic-light minimize"
              onClick={() => window.neutrino?.windowControl('minimize')}
              title="Minimize"
              aria-label="Minimize"
            >
              <span className="traffic-glyph">−</span>
            </button>
            <button
              className="traffic-light maximize"
              onClick={() => window.neutrino?.windowControl('maximize')}
              title="Maximize"
              aria-label="Maximize"
            >
              <span className="traffic-glyph">+</span>
            </button>
          </div>

          {/* Dedicated Spaces & Tabs Toggle Pill (Opaque) */}
          <button
            className={`macos-tabs-toggle-pill ${isNotificationTabsOpen ? 'active' : ''}`}
            onClick={() => setIsNotificationTabsOpen((prev) => !prev)}
            title="Spaces & Tabs (Ctrl+E)"
            aria-label="Spaces & Tabs"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span className="macos-tabs-label">Tabs</span>
            <span className="macos-tabs-count">{state.tabs.length}</span>
          </button>
        </aside>

        {/* Top Center Floating URL Pill */}
        <FloatingUrlPill
          url={activeTab?.url}
          onClick={() => setIsCommandBarOpen(true)}
        />

        {/* Top Right Controls: Modern Vector Icons (Monochromatic) */}
        <div className="minimal-top-right-cluster">
          <button
            className="minimal-pill-btn"
            onClick={() => setIsShieldModalOpen(!isShieldModalOpen)}
            title={
              settings.adblockEnabled
                ? `Shields active: ${shieldsBlockedCount} blocked`
                : `Shields off: ${shieldsBlockedCount} blocked`
            }
            aria-label="Shields"
          >
            <Shield size={14} className="modern-btn-icon" />
            <span>{shieldsBlockedCount}</span>
          </button>

          <button
            className="minimal-icon-btn"
            onClick={() => {
              setMcpInitialTab('assistants');
              setIsMcpModalOpen(true);
            }}
            title="AI Assistants & Tools (Claude, ChatGPT, Gemini, Local)"
            aria-label="AI Assistants & Tools"
          >
            <Sparkles size={15} />
          </button>

          <button
            className="minimal-icon-btn"
            onClick={toggleDarkMode}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Dark Mode"
          >
            {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            className="minimal-icon-btn"
            onClick={() => setIsThemeModalOpen(true)}
            title="Themes & Appearance"
            aria-label="Themes & Appearance"
          >
            <Palette size={15} />
          </button>

          <button
            className="minimal-icon-btn"
            onClick={openSettings}
            title="Settings (Ctrl+,)"
            aria-label="Settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* Notification-Style Tab Stack System (Left Hairlines & Sliding Deck) */}
      <NotificationTabs
        tabs={state.tabs}
        activeTabId={state.activeTabId}
        spaces={state.spaces}
        activeSpaceId={state.activeSpaceId}
        isOpen={isNotificationTabsOpen}
        onToggle={(open) => setIsNotificationTabsOpen(typeof open === 'boolean' ? open : !isNotificationTabsOpen)}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
        onCreateTab={createTab}
        onTogglePinTab={togglePinTab}
        onSelectSpace={handleSelectSpace}
        isOnWebpage={isWebpage}
      />

      {/* Edge-to-Edge Web Canvas Viewport (pulled down on web pages so site controls never collide) */}
      <main className={`arc-viewport-container edge-to-edge ${isWebpage && !isHtmlFullscreen ? 'with-site-top-offset' : ''} ${spaceTransitionClass}`}>
        <div className="arc-web-canvas-frame seamless">
          <BrowserViewport
            activeTab={activeTab}
            tabs={state.tabs}
            spaces={state.spaces}
            activeSpaceId={state.activeSpaceId}
            isDarkMode={isDarkMode}
            isSidebarOpen={false}
            onSelectSpace={handleSelectSpace}
            onUpdateTab={handleUpdateTab}
            onNavigate={navigate}
            onOpenCommandBar={() => setIsCommandBarOpen(true)}
            onMediaStateChange={handleMediaStateChange}
            mediaCommand={mediaCommand}
            userName={userProfile?.name}
            onFullscreenChange={setIsHtmlFullscreen}
          />
        </div>
      </main>

      {/* Vertical Pinned Websites Dock (Right Side with macOS Magnification) */}
      <RightPinsDock onNavigate={navigate} isOnWebpage={isWebpage} />

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

      {/* Centered Floating Command Bar (Ctrl+T / Ctrl+K / Ctrl+L) */}
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
        onToggleTheme={toggleDarkMode}
        onOpenMcp={() => setIsMcpModalOpen(true)}
        onOpenTheme={() => setIsThemeModalOpen(true)}
        onOpenShields={() => setIsShieldModalOpen(true)}
        searchEngine={settings.searchEngine}
        onOpenSettings={openSettings}
        activeTabUrl={activeTabUrl}
        isActiveSiteExcluded={isActiveSiteExcluded}
        onToggleSiteDarkMode={handleToggleSiteDarkMode}
      />

      {/* Shield Modal Flyout */}
      <ShieldModal
        isOpen={isShieldModalOpen}
        onClose={() => setIsShieldModalOpen(false)}
        stats={state.shieldStats}
        blockedItems={blockedTrackers}
        onToggleShields={toggleShields}
        enabled={settings.adblockEnabled}
      />

      {/* Browser Settings Panel (gear / Ctrl+, / Command Bar / neutrino://settings) */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
        isDarkMode={isDarkMode}
        onSetDarkMode={setDarkMode}
        onOpenThemeStudio={() => setIsThemeModalOpen(true)}
        activeTabUrl={activeTabUrl}
        userName={userProfile?.name ?? ''}
        onUserNameChange={handleUserNameChange}
      />

      {/* MCP Drawer (Right-Side) */}
      <McpModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
        activeTab={activeTab}
        onNavigate={navigate}
        initialTab={mcpInitialTab}
      />

      {/* Theme Studio Modal */}
      <ThemeCustomizerModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />

      {/* Welcome / Onboarding Flow for First Launch */}
      <WelcomeModal
        isOpen={isWelcomeOpen}
        onComplete={handleWelcomeComplete}
      />

      {/* Startup Splash Animation */}
      {isStartingUp && (
        <StartupSplash onFinished={() => setIsStartingUp(false)} />
      )}
    </div>
  );
}

export default App;
