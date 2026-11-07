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
import { RightPinsDock } from './components/RightPinsDock';
import { Shield, Moon, Sun, Sparkles, Palette } from 'lucide-react';
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

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isNotificationTabsOpen, setIsNotificationTabsOpen] = useState(false);
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

  // Automated background memory compression (Zen backend)
  useEffect(() => {
    const interval = setInterval(() => {
      zenOptimize();
    }, 180000);
    return () => clearInterval(interval);
  }, [zenOptimize]);

  // Auto-hide top controls on active web pages so they never block website controls
  const isWebpage = Boolean(
    activeTab?.url &&
    activeTab.url !== 'neutrino://newtab' &&
    activeTab.url !== 'about:blank'
  );
  const [isTopHovered, setIsTopHovered] = useState(false);
  const topHideTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!isWebpage) {
      setIsTopHovered(true);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Hovering top 36px reveals top controls smoothly
      if (e.clientY <= 36) {
        if (topHideTimerRef.current) clearTimeout(topHideTimerRef.current);
        setIsTopHovered(true);
      } else if (e.clientY > 68) {
        if (topHideTimerRef.current) clearTimeout(topHideTimerRef.current);
        topHideTimerRef.current = setTimeout(() => {
          setIsTopHovered(false);
        }, 220);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (topHideTimerRef.current) clearTimeout(topHideTimerRef.current);
    };
  }, [isWebpage]);

  // Persistent Dark Theme state (default dark mode per brief: #0A0A0B)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('neutrino_dark_theme');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
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

  // Clean up any legacy zoom locks or bad themes
  useEffect(() => {
    try {
      localStorage.removeItem('neutrino_browser_zoom');
      localStorage.removeItem('neutrino_homescreen_scale');
      const savedTheme = localStorage.getItem('neutrino_simple_theme_v5');
      if (savedTheme && savedTheme.includes('sumi-white')) {
        localStorage.removeItem('neutrino_simple_theme_v5');
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
    window.addEventListener('neutrino:open-command-bar', handleOpenCommandBar);
    window.addEventListener('neutrino:close-command-bar', handleCloseCommandBar);
    window.addEventListener('neutrino:toggle-tabs', handleToggleTabs);

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
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('neutrino:open-command-bar', handleOpenCommandBar);
      window.removeEventListener('neutrino:close-command-bar', handleCloseCommandBar);
      window.removeEventListener('neutrino:toggle-tabs', handleToggleTabs);
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
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [state.activeTabId, state.activeSpaceId, closeTab, createTab]);

  const shouldShowMiniPlayer =
    activeMediaState &&
    activeMediaState.isPlaying &&
    activeMediaState.tabId !== state.activeTabId;

  return (
    <div className="arc-app-shell radical-minimalism-shell">
      {/* Space Name Animation Overlay */}
      {spaceOverlay && (
        <div className="macos-space-name-overlay">
          <span className="macos-space-name-text">{spaceOverlay}</span>
        </div>
      )}

      {/* Top Edge Invisible Trigger Zone (reveals controls on web pages when hovered) */}
      {isWebpage && (
        <div
          className="top-edge-hover-zone"
          onMouseEnter={() => {
            if (topHideTimerRef.current) clearTimeout(topHideTimerRef.current);
            setIsTopHovered(true);
          }}
        />
      )}

      {/* Floating Top Chrome Capsule (Auto-hides on web pages to not interfere with site controls) */}
      <div
        className={`floating-top-chrome-capsule ${isWebpage && !isTopHovered && !isCommandBarOpen ? 'autohidden' : 'visible'}`}
        onMouseEnter={() => {
          if (topHideTimerRef.current) clearTimeout(topHideTimerRef.current);
          setIsTopHovered(true);
        }}
        onMouseLeave={() => {
          if (isWebpage) {
            topHideTimerRef.current = setTimeout(() => setIsTopHovered(false), 220);
          }
        }}
      >
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
            title={`Shields active: ${state.shieldStats.totalBlocked || (state.shieldStats.trackersBlocked + state.shieldStats.adsBlocked)} blocked`}
            aria-label="Shields"
          >
            <Shield size={14} className="modern-btn-icon" />
            <span>{state.shieldStats.totalBlocked || (state.shieldStats.trackersBlocked + state.shieldStats.adsBlocked)}</span>
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
      />

      {/* Edge-to-Edge Web Canvas Viewport */}
      <main className={`arc-viewport-container edge-to-edge ${spaceTransitionClass}`}>
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
          />
        </div>
      </main>

      {/* Vertical Pinned Websites Dock (Right Side with macOS Magnification) */}
      <RightPinsDock onNavigate={navigate} />

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
    </div>
  );
}

export default App;
