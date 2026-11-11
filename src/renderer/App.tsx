import React, { Suspense, lazy, useEffect, useState, useRef, useCallback } from 'react';
import { useBrowser } from './hooks/useBrowser';
import { FloatingUrlPill } from './components/FloatingUrlPill';
import { BrowserViewport } from './components/BrowserViewport';
import { StartupSplash } from './components/StartupSplash';
import { RightPinsDock, type PinnedSite } from './components/RightPinsDock';
import { AuthHandoffNotice } from './components/AuthHandoffNotice';
import type { UserProfile } from './components/WelcomeModal';
import { useSettings } from './hooks/useSettings';
import { isHostExcluded, resolveSpaceTheme, toggleSiteExclusion } from '../main/settings';
import { type SpaceTheme, getDefaultSpaceTheme } from '../main/spaceTheme';
import { applySpaceThemeToRoot, getOsPrefersDark } from './utils/applySpaceTheme';
import { Shield, Moon, Sun, Sparkles, Palette, Settings, History, Lock } from 'lucide-react';
import {
  TabState,
  ActiveMediaState,
  HistoryEntry,
  HistoryClearRange,
  VpnConfig,
  VpnStatus,
} from './types';
import './styles/theme.css';

const NotificationTabs = lazy(() =>
  import('./components/NotificationTabs').then((m) => ({ default: m.NotificationTabs }))
);
const CommandBar = lazy(() =>
  import('./components/CommandBar').then((m) => ({ default: m.CommandBar }))
);
const ShieldModal = lazy(() =>
  import('./components/ShieldModal').then((m) => ({ default: m.ShieldModal }))
);
const McpModal = lazy(() =>
  import('./components/McpModal').then((m) => ({ default: m.McpModal }))
);
const ThemeCustomizerModal = lazy(() =>
  import('./components/ThemeCustomizerModal').then((m) => ({ default: m.ThemeCustomizerModal }))
);
const MediaPlayer = lazy(() =>
  import('./components/MediaPlayer').then((m) => ({ default: m.MediaPlayer }))
);
const WelcomeModal = lazy(() =>
  import('./components/WelcomeModal').then((m) => ({ default: m.WelcomeModal }))
);
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
);
const HistoryModal = lazy(() =>
  import('./components/HistoryModal').then((m) => ({ default: m.HistoryModal }))
);
const VpnModal = lazy(() =>
  import('./components/VpnModal').then((m) => ({ default: m.VpnModal }))
);

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

  const { settings, updateSettings, isLoaded: settingsLoaded } = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [isVpnModalOpen, setIsVpnModalOpen] = useState(false);
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null);
  const [isCheckingVpnIp, setIsCheckingVpnIp] = useState(false);
  const [vpnIpError, setVpnIpError] = useState<string | null>(null);

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isNotificationTabsOpen, setIsNotificationTabsOpen] = useState(false);
  const [isTabsDrawerMounted, setIsTabsDrawerMounted] = useState(false);
  useEffect(() => {
    if (isNotificationTabsOpen) {
      setIsTabsDrawerMounted(true);
      return;
    }
    if (!isTabsDrawerMounted) return;
    const t = setTimeout(() => setIsTabsDrawerMounted(false), 300);
    return () => clearTimeout(t);
  }, [isNotificationTabsOpen, isTabsDrawerMounted]);
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
    void updateSettings({
      userProfile: profile,
      onboardingCompleted: true,
      theme: isDarkMode ? 'dark' : 'light',
    });
  };

  // Display name edited in the Settings panel; same key and shape WelcomeModal writes.
  const handleUserNameChange = useCallback(
    (name: string) => {
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
        } catch { }
        void updateSettings({ userProfile: next });
        return next;
      });
    },
    [updateSettings]
  );

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

  // Track OS dark/light preference for Spaces configured in 'auto' mode
  const [osPrefersDark, setOsPrefersDark] = useState<boolean>(() => getOsPrefersDark());
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setOsPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const activeSpace = state.spaces.find((s) => s.id === state.activeSpaceId) || state.spaces[0];
  const activeSpaceTheme = resolveSpaceTheme(settings, state.activeSpaceId);

  const themeTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerThemeCrossFade = useCallback(() => {
    if (themeTransitionTimerRef.current !== null) {
      clearTimeout(themeTransitionTimerRef.current);
    }
    document.documentElement.classList.add('space-theme-transitioning');
    themeTransitionTimerRef.current = setTimeout(() => {
      themeTransitionTimerRef.current = null;
      document.documentElement.classList.remove('space-theme-transitioning');
    }, 320);
  }, []);

  useEffect(() => {
    return () => {
      if (themeTransitionTimerRef.current !== null) {
        clearTimeout(themeTransitionTimerRef.current);
      }
    };
  }, []);

  // Persistent Dark Theme state (kept in sync with active Space theme effective mode)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('neutrino_dark_theme');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const lastIpcThemeModeRef = useRef<string | null>(null);
  useEffect(() => {
    const palette = applySpaceThemeToRoot(activeSpaceTheme, osPrefersDark);
    const nextDark = palette.effectiveMode === 'dark';
    setIsDarkMode((prev) => (prev === nextDark ? prev : nextDark));
    try {
      localStorage.setItem('neutrino_dark_theme', nextDark ? 'true' : 'false');
    } catch { }

    const desiredIpcMode: 'dark' | 'light' | 'system' =
      activeSpaceTheme.mode === 'auto' ? 'system' : nextDark ? 'dark' : 'light';
    if (lastIpcThemeModeRef.current !== desiredIpcMode) {
      lastIpcThemeModeRef.current = desiredIpcMode;
      void window.neutrino?.setThemeMode?.(desiredIpcMode);
    }
  }, [activeSpaceTheme, osPrefersDark]);

  const handleChangeSpaceTheme = useCallback(
    (nextTheme: SpaceTheme, options?: { immediateSave?: boolean; animateTransition?: boolean }) => {
      if (options?.animateTransition) {
        triggerThemeCrossFade();
      }
      const palette = applySpaceThemeToRoot(nextTheme, osPrefersDark);
      if (options?.immediateSave !== false) {
        void updateSettings({
          theme: palette.effectiveMode,
          spaceThemes: {
            ...(settings.spaceThemes || {}),
            [state.activeSpaceId]: nextTheme,
          },
        });
      }
    },
    [osPrefersDark, settings.spaceThemes, state.activeSpaceId, triggerThemeCrossFade, updateSettings]
  );

  const handleResetSpaceTheme = useCallback(() => {
    triggerThemeCrossFade();
    const fallbackTheme = getDefaultSpaceTheme(state.activeSpaceId);
    const palette = applySpaceThemeToRoot(fallbackTheme, osPrefersDark);
    void updateSettings({
      theme: palette.effectiveMode,
      spaceThemes: {
        ...(settings.spaceThemes || {}),
        [state.activeSpaceId]: fallbackTheme,
      },
    });
  }, [osPrefersDark, settings.spaceThemes, state.activeSpaceId, triggerThemeCrossFade, updateSettings]);

  // Persist and apply a theme mode for the active Space; shared by top-bar toggle & Settings panel.
  const setDarkMode = useCallback(
    (next: boolean) => {
      triggerThemeCrossFade();
      const updatedTheme: SpaceTheme = {
        ...activeSpaceTheme,
        mode: next ? 'dark' : 'light',
      };
      applySpaceThemeToRoot(updatedTheme, osPrefersDark);
      setIsDarkMode(next);
      void window.neutrino?.setThemeMode?.(next ? 'dark' : 'light');
      void updateSettings({
        theme: next ? 'dark' : 'light',
        spaceThemes: {
          ...(settings.spaceThemes || {}),
          [state.activeSpaceId]: updatedTheme,
        },
      });
    },
    [activeSpaceTheme, osPrefersDark, settings.spaceThemes, state.activeSpaceId, triggerThemeCrossFade, updateSettings]
  );

  const toggleDarkMode = () => {
    setDarkMode(!isDarkMode);
  };

  // Reconcile cached main-process settings (`browser-state.json`) once loaded on startup
  const hydratedFromMainRef = useRef(false);
  useEffect(() => {
    if (!settingsLoaded || hydratedFromMainRef.current) return;
    hydratedFromMainRef.current = true;

    const migrationPatch: Record<string, unknown> = {};

    if (settings.theme !== 'dark' && settings.theme !== 'light') {
      migrationPatch.theme = isDarkMode ? 'dark' : 'light';
    }

    const persistedProfile = settings.userProfile as UserProfile | undefined;
    if (persistedProfile && typeof persistedProfile === 'object' && typeof persistedProfile.name === 'string') {
      setUserProfile(persistedProfile);
      setIsWelcomeOpen(false);
      try {
        localStorage.setItem('neutrino_user_profile', JSON.stringify(persistedProfile));
        localStorage.setItem('neutrino_onboarding_completed', 'true');
      } catch { }
    } else if (settings.onboardingCompleted === true) {
      setIsWelcomeOpen(false);
      try {
        localStorage.setItem('neutrino_onboarding_completed', 'true');
      } catch { }
    } else if (userProfile) {
      migrationPatch.userProfile = userProfile;
      migrationPatch.onboardingCompleted = true;
    }

    if (!settings.customTheme) {
      try {
        const savedTheme = localStorage.getItem('neutrino_simple_theme_v5');
        if (savedTheme) migrationPatch.customTheme = JSON.parse(savedTheme);
      } catch { }
    }

    if (!Array.isArray(settings.pinnedSites)) {
      try {
        const savedPins = localStorage.getItem('neutrino_pinned_sites');
        if (savedPins) migrationPatch.pinnedSites = JSON.parse(savedPins);
      } catch { }
    }

    if (Object.keys(migrationPatch).length > 0) {
      void updateSettings(migrationPatch);
    }
  }, [settingsLoaded, settings, isDarkMode, userProfile, updateSettings]);

  // Clean up any legacy zoom locks or invalid custom themes
  useEffect(() => {
    try {
      localStorage.removeItem('neutrino_browser_zoom');
      localStorage.removeItem('neutrino_homescreen_scale');
      const validAccents = new Set(['#FFFFFF', '#1C1917', '#E4E4E7', '#71717A', '#38BDF8', '#10B981']);
      const savedTheme = localStorage.getItem('neutrino_simple_theme_v5');
      if (savedTheme) {
        try {
          const parsed = JSON.parse(savedTheme);
          if (parsed.accent && !validAccents.has(String(parsed.accent).toUpperCase())) {
            localStorage.removeItem('neutrino_simple_theme_v5');
          }
        } catch {
          localStorage.removeItem('neutrino_simple_theme_v5');
        }
      }
      document.documentElement.style.zoom = '';
    } catch { }
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

    triggerThemeCrossFade();

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
      setIsThemeModalOpen(false);
      setIsHistoryModalOpen(false);
      setIsVpnModalOpen(false);
    });
    // Ctrl+Comma while a webview has focus (main process before-input-event)
    const unsubIpcSettings = window.neutrino?.onOpenSettings?.(() => {
      setIsSettingsOpen(true);
    });
    const unsubIpcHistory = window.neutrino?.onOpenHistory?.(() => {
      setIsHistoryModalOpen(true);
    });
    // neutrino://settings, neutrino://history, neutrino://vpn from useBrowser.navigate
    const handleOpenSettingsEvent = () => setIsSettingsOpen(true);
    const handleOpenHistoryEvent = () => setIsHistoryModalOpen(true);
    const handleOpenVpnEvent = () => setIsVpnModalOpen(true);

    window.addEventListener('neutrino:open-settings', handleOpenSettingsEvent);
    window.addEventListener('neutrino:open-history', handleOpenHistoryEvent);
    window.addEventListener('neutrino:open-vpn', handleOpenVpnEvent);
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
      unsubIpcHistory?.();
      window.removeEventListener('neutrino:open-settings', handleOpenSettingsEvent);
      window.removeEventListener('neutrino:open-history', handleOpenHistoryEvent);
      window.removeEventListener('neutrino:open-vpn', handleOpenVpnEvent);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('neutrino:open-command-bar', handleOpenCommandBar);
      window.removeEventListener('neutrino:close-command-bar', handleCloseCommandBar);
      window.removeEventListener('neutrino:toggle-tabs', handleToggleTabs);
      window.removeEventListener('neutrino:close-active-tab', handleCloseActiveTab);
    };
  }, [state.activeTabId, state.spaces, activeTab, closeTab, handleSelectSpace, setIsCommandBarOpen]);

  // Built-in VPN state hydration & lazy History hydration (only fetch 500 history entries when open)
  useEffect(() => {
    void window.neutrino?.getVpnStatus?.().then((status) => {
      if (status) setVpnStatus(status);
    });
    const unsubVpn = window.neutrino?.onVpnStatusUpdated?.((status) => {
      if (status) setVpnStatus(status);
    });

    return () => {
      unsubVpn?.();
    };
  }, []);

  useEffect(() => {
    if (!isHistoryModalOpen) {
      setHistoryEntries((prev) => (prev.length > 0 ? [] : prev));
      return;
    }
    void window.neutrino?.getHistory?.({ limit: 500 }).then((list) => {
      if (Array.isArray(list)) setHistoryEntries(list);
    });
    const unsubHistory = window.neutrino?.onHistoryUpdated?.((entries) => {
      if (Array.isArray(entries)) setHistoryEntries(entries);
    });
    return () => {
      unsubHistory?.();
    };
  }, [isHistoryModalOpen]);

  useEffect(() => {
    if (!isVpnModalOpen) return;
    void window.neutrino?.getVpnStatus?.().then((status) => {
      if (status) setVpnStatus(status);
    });
  }, [isVpnModalOpen]);

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
      } catch { }
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
        } else if (key === 'h') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setIsCommandBarOpen(false);
          setIsHistoryModalOpen((prev) => !prev);
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

  const handleOpenHistoryUrl = useCallback(
    (url: string, options?: { newTab?: boolean }) => {
      if (options?.newTab || !activeTab) {
        void createTab(url, state.activeSpaceId);
      } else {
        navigate(url);
      }
    },
    [activeTab, createTab, navigate, state.activeSpaceId],
  );

  const handleDeleteHistoryEntry = useCallback(async (entry: HistoryEntry) => {
    await window.neutrino?.deleteHistoryEntry?.({
      id: entry.id,
      url: entry.url,
      timestamp: entry.timestamp,
    });
  }, []);

  const handleClearHistory = useCallback(async (range: HistoryClearRange) => {
    await window.neutrino?.clearHistory?.(range);
  }, []);

  const handleVpnConnect = useCallback(async (patch?: Partial<VpnConfig>) => {
    const next = await window.neutrino?.connectVpn?.(patch);
    if (next) setVpnStatus(next);
  }, []);

  const handleVpnDisconnect = useCallback(async () => {
    const next = await window.neutrino?.disconnectVpn?.();
    if (next) setVpnStatus(next);
  }, []);

  const handleVpnUpdateConfig = useCallback(async (patch: Partial<VpnConfig>) => {
    const next = await window.neutrino?.updateVpnConfig?.(patch);
    if (next) setVpnStatus(next);
  }, []);

  const handleVpnCheckIp = useCallback(async () => {
    setIsCheckingVpnIp(true);
    setVpnIpError(null);
    try {
      const res = await window.neutrino?.checkVpnIp?.();
      if (res && 'error' in res) {
        setVpnIpError(res.error);
      }
    } finally {
      setIsCheckingVpnIp(false);
    }
  }, []);

  const shouldShowMiniPlayer =
    activeMediaState &&
    activeMediaState.isPlaying &&
    activeMediaState.tabId !== state.activeTabId;

  return (
    <div className="arc-app-shell radical-minimalism-shell">
      <div className="space-grain-overlay" aria-hidden="true" />
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
            className={`minimal-pill-btn vpn-top-pill ${vpnStatus?.state === 'connected' ? 'vpn-connected' : vpnStatus?.state === 'error' ? 'vpn-error' : ''}`}
            onClick={() => setIsVpnModalOpen(!isVpnModalOpen)}
            title={
              vpnStatus?.state === 'connected'
                ? `VPN Tunnel Active (${vpnStatus.activeProxyRule || vpnStatus.config.mode})`
                : vpnStatus?.state === 'error'
                  ? `VPN Error: ${vpnStatus.lastError || 'Check tunnel'}`
                  : 'Built-in VPN & Privacy Tunnel'
            }
            aria-label="Built-in VPN"
          >
            <Lock size={13} className="modern-btn-icon" />
            <span>{vpnStatus?.state === 'connected' ? 'VPN ON' : 'VPN'}</span>
          </button>

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
            onClick={() => setIsHistoryModalOpen((prev) => !prev)}
            title="Browsing History (Ctrl+H)"
            aria-label="Browsing History"
          >
            <History size={15} />
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

      {/* Notification-Style Tab Stack System (Mounted on demand, unmounts after exit anim) */}
      {isTabsDrawerMounted && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

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

      {/* Google sign-in refused in-app: offer to continue in the default browser */}
      <AuthHandoffNotice />

      {/* Vertical Pinned Websites Dock (Right Side with macOS Magnification) */}
      <RightPinsDock
        onNavigate={navigate}
        isOnWebpage={isWebpage}
        persistedPins={Array.isArray(settings.pinnedSites) ? (settings.pinnedSites as PinnedSite[]) : undefined}
        onPersistPins={(pins) => void updateSettings({ pinnedSites: pins })}
      />

      {/* Floating Media Player (PiP) */}
      {shouldShowMiniPlayer && (
        <Suspense fallback={null}>
          <MediaPlayer
            mediaState={activeMediaState}
            onPlayPause={handleMediaPlayPause}
            onSeek={handleMediaSeek}
            onVolume={handleMediaVolume}
            onGoToTab={handleGoToMediaTab}
            onClose={handleCloseMediaPlayer}
          />
        </Suspense>
      )}

      {/* Centered Floating Command Bar (Ctrl+T / Ctrl+K / Ctrl+L) */}
      {isCommandBarOpen && (
        <Suspense fallback={null}>
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
            onOpenHistory={() => setIsHistoryModalOpen(true)}
            onOpenVpn={() => setIsVpnModalOpen(true)}
            activeTabUrl={activeTabUrl}
            isActiveSiteExcluded={isActiveSiteExcluded}
            onToggleSiteDarkMode={handleToggleSiteDarkMode}
          />
        </Suspense>
      )}

      {/* Built-in VPN / Privacy Tunnel Modal */}
      {isVpnModalOpen && (
        <Suspense fallback={null}>
          <VpnModal
            isOpen={isVpnModalOpen}
            onClose={() => setIsVpnModalOpen(false)}
            status={vpnStatus}
            onConnect={handleVpnConnect}
            onDisconnect={handleVpnDisconnect}
            onUpdateConfig={handleVpnUpdateConfig}
            onCheckIp={handleVpnCheckIp}
            isCheckingIp={isCheckingVpnIp}
            ipCheckError={vpnIpError}
          />
        </Suspense>
      )}

      {/* Browsing History Modal */}
      {isHistoryModalOpen && (
        <Suspense fallback={null}>
          <HistoryModal
            isOpen={isHistoryModalOpen}
            onClose={() => setIsHistoryModalOpen(false)}
            entries={historyEntries}
            onOpenUrl={handleOpenHistoryUrl}
            onDeleteEntry={handleDeleteHistoryEntry}
            onClearHistory={handleClearHistory}
          />
        </Suspense>
      )}

      {/* Shield Modal Flyout */}
      {isShieldModalOpen && (
        <Suspense fallback={null}>
          <ShieldModal
            isOpen={isShieldModalOpen}
            onClose={() => setIsShieldModalOpen(false)}
            stats={state.shieldStats}
            blockedItems={blockedTrackers}
            onToggleShields={toggleShields}
            enabled={settings.adblockEnabled}
          />
        </Suspense>
      )}

      {/* Browser Settings Panel (gear / Ctrl+, / Command Bar / neutrino://settings) */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* MCP Drawer (Right-Side) */}
      {isMcpModalOpen && (
        <Suspense fallback={null}>
          <McpModal
            isOpen={isMcpModalOpen}
            onClose={() => setIsMcpModalOpen(false)}
            activeTab={activeTab}
            onNavigate={navigate}
            initialTab={mcpInitialTab}
          />
        </Suspense>
      )}

      {/* Theme Studio Popover */}
      {isThemeModalOpen && (
        <Suspense fallback={null}>
          <ThemeCustomizerModal
            isOpen={isThemeModalOpen}
            onClose={() => setIsThemeModalOpen(false)}
            activeSpace={activeSpace}
            spaceTheme={activeSpaceTheme}
            onChangeSpaceTheme={handleChangeSpaceTheme}
            onResetSpaceTheme={handleResetSpaceTheme}
            isDarkMode={isDarkMode}
            onSetDarkMode={setDarkMode}
            persistedCustomTheme={
              settings.customTheme && typeof settings.customTheme === 'object'
                ? (settings.customTheme as { themeId: string; accent: string })
                : undefined
            }
            onPersistCustomTheme={(customTheme) => void updateSettings({ customTheme })}
          />
        </Suspense>
      )}

      {/* Welcome / Onboarding Flow for First Launch */}
      {isWelcomeOpen && (
        <Suspense fallback={null}>
          <WelcomeModal
            isOpen={isWelcomeOpen}
            onComplete={handleWelcomeComplete}
          />
        </Suspense>
      )}

      {/* Startup Splash Animation */}
      {isStartingUp && (
        <StartupSplash onFinished={() => setIsStartingUp(false)} />
      )}
    </div>
  );
}

export default App;
