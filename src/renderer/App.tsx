import React, { Suspense, lazy, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useBrowser } from './hooks/useBrowser';
import { useProfiles } from './hooks/useProfiles';
import { Sidebar } from './components/Sidebar';
import { buildSidebarView } from './utils/sidebarModel';
import { selectSpaceByIndex } from '../main/sidebar/layout';
import { FloatingUrlPill } from './components/FloatingUrlPill';
import { BrowserViewport } from './components/BrowserViewport';
import { StartupSplash } from './components/StartupSplash';
import { RightPinsDock, type PinnedSite } from './components/RightPinsDock';
import { AuthHandoffNotice } from './components/AuthHandoffNotice';
import { PasswordPrompt } from './components/PasswordPrompt';
import type { UserProfile } from './components/WelcomeModal';
import { useSettings } from './hooks/useSettings';
import { resolveSpaceTheme, resolveReducedEffectsActive } from '../main/settings';
import { type SpaceTheme, getDefaultSpaceTheme } from '../main/spaceTheme';
import { applySpaceThemeToRoot, getOsPrefersDark } from './utils/applySpaceTheme';
import { computeTopBarTint, type PageColorReport, type TabPageColor } from './utils/topBarTint';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  X,
  Shield,
  Moon,
  Sun,
  Sparkles,
  Palette,
  Settings,
  History,
  Lock,
} from 'lucide-react';
import {
  TabState,
  ActiveMediaState,
  HistoryEntry,
  HistoryClearRange,
  VpnConfig,
  VpnStatus,
  SiteAction,
  PerformanceStatus,
} from './types';
import './styles/theme.css';

const ArchiveList = lazy(() =>
  import('./components/ArchiveList').then((m) => ({ default: m.ArchiveList }))
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
  const browser = useBrowser();
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
    reopenClosedTab,
    selectTab,
    toggleSleepTab,
    selectSpace,
    createSpace,
    deleteSpace,
    reorderTabs,
    toggleShields,
    resetShieldStats,
    zenOptimize,
  } = browser;
  const { activeProfile } = useProfiles();

  const { settings, updateSettings, isLoaded: settingsLoaded } = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [isVpnModalOpen, setIsVpnModalOpen] = useState(false);
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null);
  const [performanceStatus, setPerformanceStatus] = useState<PerformanceStatus | null>(null);
  const [isCheckingVpnIp, setIsCheckingVpnIp] = useState(false);
  const [vpnIpError, setVpnIpError] = useState<string | null>(null);

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  // Sidebar (R12): expanded/collapsed and auto-hide persist through the settings IPC (R12.5).
  // Ctrl+E (`toggle-tabs`) toggles expanded/collapsed (R12.3, decision A2).
  const sidebarExpanded = settings.sidebarExpanded;
  const sidebarExpandedRef = useRef(sidebarExpanded);
  sidebarExpandedRef.current = sidebarExpanded;
  const setSidebarExpanded = useCallback(
    (next: boolean) => {
      if (next === sidebarExpandedRef.current) return;
      sidebarExpandedRef.current = next;
      void updateSettings({ sidebarExpanded: next });
    },
    [updateSettings]
  );
  const toggleSidebar = useCallback(() => {
    setSidebarExpanded(!sidebarExpandedRef.current);
  }, [setSidebarExpanded]);

  // New tab control / Ctrl+T (R12.8): the Command_Bar opens in "new tab" mode and its
  // submission creates a Today tab in the Active_Space instead of navigating the current tab.
  const [isCommandBarNewTab, setIsCommandBarNewTab] = useState(false);
  const openCommandBar = useCallback(() => {
    setIsCommandBarNewTab(false);
    setIsCommandBarOpen(true);
  }, [setIsCommandBarOpen]);
  const openNewTabCommandBar = useCallback(() => {
    setIsCommandBarNewTab(true);
    setIsCommandBarOpen(true);
  }, [setIsCommandBarOpen]);
  useEffect(() => {
    if (!isCommandBarOpen) setIsCommandBarNewTab(false);
  }, [isCommandBarOpen]);
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

  useEffect(() => {
    void window.neutrino?.getPerformanceStatus?.().then((status) => {
      if (status) setPerformanceStatus(status);
    });
    const unsubPerf = window.neutrino?.onPerformanceStatusUpdated?.((status) => {
      if (status) setPerformanceStatus(status);
    });
    const syncHidden = () => {
      document.documentElement.setAttribute('data-window-hidden', document.hidden ? 'true' : 'false');
    };
    syncHidden();
    document.addEventListener('visibilitychange', syncHidden);
    return () => {
      unsubPerf?.();
      document.removeEventListener('visibilitychange', syncHidden);
    };
  }, []);

  const isReducedEffects = resolveReducedEffectsActive(
    settings.reducedEffectsMode,
    Boolean(performanceStatus?.gpuDisabledFlag),
    performanceStatus?.gpuFeatureStatus ?? null
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-reduced-effects', isReducedEffects ? 'on' : 'off');
  }, [isReducedEffects]);

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

  // Dia-style top bar tint (R20). BrowserViewport reports the active page's theme-color and
  // sampled top color; reports for a tab that is no longer active are ignored. Internal pages,
  // HTML fullscreen and undeterminable colors keep the default theme (R20.5, R20.6, R21.12).
  const [pageColor, setPageColor] = useState<TabPageColor | null>(null);
  const activeTabIdRef = useRef<string | undefined>(activeTab?.id);
  activeTabIdRef.current = activeTab?.id;
  const handlePageColor = useCallback((tabId: string, report: PageColorReport) => {
    if (tabId !== activeTabIdRef.current) return;
    setPageColor({ tabId, ...report });
  }, []);
  const topBarTint = computeTopBarTint({
    activeTabId: activeTab?.id,
    activeTabUrl: activeTab?.url,
    activeTabIsSleeping: activeTab?.isSleeping,
    report: pageColor,
    suppressed: isHtmlFullscreen,
  });
  const isTopBarTinted = Boolean(topBarTint) && isWebpage;

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

  // Space_Switcher order (profiles in creation order, then each profile's spaces), used by Ctrl+1..9.
  const spaceSwitcherOrder = useMemo(() => buildSidebarView(state).spaceOrder, [state]);

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

  const handleCreateSpace = async (name: string, color?: string) => {
    const created = await createSpace(name, color);
    if (created) {
      triggerThemeCrossFade();
      setSpaceTransitionClass('space-transition-left');
      setSpaceOverlay(created.name);
      setTimeout(() => {
        setSpaceTransitionClass('');
      }, 450);
      setTimeout(() => {
        setSpaceOverlay(null);
      }, 1100);
    }
    return created;
  };

  // Keyboard shortcuts & events
  useEffect(() => {
    const handleOpenCommandBar = () => openCommandBar();
    const handleCloseCommandBar = () => setIsCommandBarOpen(false);
    const handleToggleTabs = (e: any) => {
      const open = e?.detail?.open;
      if (typeof open === 'boolean') setSidebarExpanded(open);
      else toggleSidebar();
    };
    const handleCloseActiveTab = () => {
      if (state.activeTabId) {
        closeTab(state.activeTabId);
      }
    };

    // Native Electron IPC listeners (authoritative single-dispatch from main process)
    const unsubIpcToggle = window.neutrino?.onToggleTabs?.(() => {
      toggleSidebar();
    });
    // Ctrl+T arrives as `{ newTab: true }` (R12.8); Ctrl+K/L/F6 open the bar normally.
    const unsubIpcCmd = window.neutrino?.onOpenCommandBar?.((opts) => {
      if (opts?.newTab) openNewTabCommandBar();
      else openCommandBar();
    });
    const unsubIpcEsc = window.neutrino?.onEscapePressed?.(() => {
      setIsCommandBarOpen(false);
      setIsArchiveOpen(false);
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
    const unsubIpcSpaceSwitched = window.neutrino?.onSpaceSwitched?.((payload) => {
      triggerThemeCrossFade();
      if (payload?.spaceName) {
        setSpaceOverlay(payload.spaceName);
        setTimeout(() => setSpaceOverlay(null), 1100);
      }
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

    // Fallback when running renderer standalone outside Electron (main process owns shortcuts in Electron)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (window.neutrino?.isElectron) return;
      // Ctrl+1..9: the Nth space in Space_Switcher order; fewer than N keeps the current one (R13.4/13.5).
      if ((e.ctrlKey || e.metaKey) && e.key.length === 1 && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const nextId = selectSpaceByIndex(spaceSwitcherOrder, Number(e.key), state.activeSpaceId);
        if (nextId !== state.activeSpaceId) {
          handleSelectSpace(nextId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      unsubIpcToggle?.();
      unsubIpcCmd?.();
      unsubIpcEsc?.();
      unsubIpcSettings?.();
      unsubIpcHistory?.();
      unsubIpcSpaceSwitched?.();
      window.removeEventListener('neutrino:open-settings', handleOpenSettingsEvent);
      window.removeEventListener('neutrino:open-history', handleOpenHistoryEvent);
      window.removeEventListener('neutrino:open-vpn', handleOpenVpnEvent);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('neutrino:open-command-bar', handleOpenCommandBar);
      window.removeEventListener('neutrino:close-command-bar', handleCloseCommandBar);
      window.removeEventListener('neutrino:toggle-tabs', handleToggleTabs);
      window.removeEventListener('neutrino:close-active-tab', handleCloseActiveTab);
    };
}, [state.activeTabId, state.activeSpaceId, spaceSwitcherOrder, activeTab, closeTab, handleSelectSpace, setIsCommandBarOpen, triggerThemeCrossFade, toggleSidebar, setSidebarExpanded, openCommandBar, openNewTabCommandBar]);

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

// Fallback Capturing Keyboard Shortcuts (only outside Electron where before-input-event is unavailable)
useEffect(() => {
  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (window.neutrino?.isElectron) return;
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
        openNewTabCommandBar();
      } else if (key === 'k' || key === 'l') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setIsCommandBarOpen((prev) => !prev);
      } else if (key === 'e') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toggleSidebar();
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
}, [state.activeTabId, closeTab, openNewTabCommandBar, toggleSidebar]);

const dispatchSiteAction = useCallback((action: SiteAction) => {
  window.dispatchEvent(new CustomEvent('neutrino:site-action', { detail: { action, source: 'ui' } }));
}, []);

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

// Command_Bar submission: in new-tab mode (Ctrl+T / sidebar new tab control) a URL or search
// opens a Today tab in the Active_Space (R12.8); neutrino:// panel URLs still open their panel.
const handleCommandBarNavigate = (url: string) => {
  if (isCommandBarNewTab && !/^neutrino:\/\/(settings|history|vpn)$/i.test(url.trim())) {
    void createTab(url, state.activeSpaceId);
    return;
  }
  navigate(url);
};

// Assistant drawer webviews follow the Active_Profile's session (R3.3, A3). The active tab's
// partition comes with every state-update; listProfiles covers a space with no tab yet.
const activeTabInSpace = activeTab && activeTab.spaceId === state.activeSpaceId ? activeTab : undefined;
const activeProfilePartition = activeTabInSpace?.partition ?? activeProfile?.partition;

// Sidebar placement: docked (not auto-hide) pushes the web canvas right; hidden in HTML fullscreen.
const showSidebar = !isHtmlFullscreen;
const sidebarAutoHide = settings.sidebarAutoHide;
const isSidebarDocked = showSidebar && !sidebarAutoHide;
const shellStyle = {
  '--app-sidebar-width': isSidebarDocked ? (sidebarExpanded ? '240px' : '56px') : '0px',
  '--app-top-offset': isWebpage ? '44px' : '60px',
} as React.CSSProperties;

return (
  <div className="arc-app-shell radical-minimalism-shell" style={shellStyle}>
    <div className="space-grain-overlay" aria-hidden="true" />
    {/* Frameless Top Drag Bar */}
    {!isHtmlFullscreen && (
      <div className={`macos-window-drag-bar ${isWebpage ? 'on-webpage' : ''}`} />
    )}

    {/* Arc-style Sidebar: favorites, pinned, Today and Space_Switcher (R12.1) */}
    {showSidebar && (
      <Sidebar
        className="app-sidebar"
        state={state}
        actions={{ ...browser, selectSpace: handleSelectSpace, openCommandBar: openNewTabCommandBar }}
        expanded={sidebarExpanded}
        autoHide={sidebarAutoHide}
        onUpdateSidebarState={(patch) => void updateSettings(patch)}
      />
    )}

    {/* Space Name Animation Overlay */}
    {spaceOverlay && (
      <div className="macos-space-name-overlay">
        <span className="macos-space-name-text">{spaceOverlay}</span>
      </div>
    )}

    {/* Top Chrome Header Bar (Solid dedicated header on web pages, floating on newtab) */}
    <div
      className={`floating-top-chrome-capsule ${isWebpage ? 'on-webpage' : ''} ${isTopBarTinted ? 'topbar-tinted' : ''} ${shouldShowTopBar ? 'visible' : 'autohidden'}`}
      style={isTopBarTinted && topBarTint ? (topBarTint.vars as React.CSSProperties) : undefined}
      data-topbar-tint={isTopBarTinted && topBarTint ? topBarTint.source : 'default'}
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
          className={`macos-tabs-toggle-pill ${sidebarExpanded ? 'active' : ''}`}
          onClick={toggleSidebar}
          title={sidebarExpanded ? 'Collapse sidebar (Ctrl+E)' : 'Expand sidebar (Ctrl+E)'}
          aria-label="Toggle sidebar"
          aria-pressed={sidebarExpanded}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          <span
            className="macos-tabs-space-dot"
            style={{ backgroundColor: activeSpace?.color || '#E4E4E7' }}
          />
          <span className="macos-tabs-space-name" data-testid="active-space-indicator">
            {activeSpace?.name || 'Study'}
          </span>
          <span className="macos-tabs-count" data-testid="active-space-tab-count">
            {currentSpaceTabs.length}
          </span>
        </button>

        {/* Compact Site Navigation Controls */}
        <div className="site-nav-controls" role="group" aria-label="Site controls">
          <button
            type="button"
            className="site-nav-btn"
            onClick={() => dispatchSiteAction('back')}
            disabled={!isWebpage || !activeTab?.canGoBack}
            title="Back (Alt+Left / Two-finger Swipe Left)"
            aria-label="Go Back"
          >
            <ArrowLeft size={14} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className="site-nav-btn"
            onClick={() => dispatchSiteAction('forward')}
            disabled={!isWebpage || !activeTab?.canGoForward}
            title="Forward (Alt+Right / Two-finger Swipe Right)"
            aria-label="Go Forward"
          >
            <ArrowRight size={14} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className="site-nav-btn"
            onClick={() => dispatchSiteAction(activeTab?.isLoading ? 'stop' : 'reload')}
            disabled={!isWebpage}
            title={activeTab?.isLoading ? 'Stop Loading (Esc)' : 'Reload Page (Ctrl+R)'}
            aria-label={activeTab?.isLoading ? 'Stop Loading' : 'Reload Page'}
          >
            {activeTab?.isLoading ? (
              <X size={14} strokeWidth={2.2} />
            ) : (
              <RotateCw size={13.5} strokeWidth={2.1} />
            )}
          </button>
          <button
            type="button"
            className="site-nav-btn"
            onClick={() => dispatchSiteAction('home')}
            disabled={!isWebpage}
            title="Homescreen (Alt+Home)"
            aria-label="Home"
          >
            <Home size={13.5} strokeWidth={2.1} />
          </button>
        </div>
      </aside>

      {/* Top Center Floating URL Pill */}
      <FloatingUrlPill
        url={activeTab?.url}
        isLoading={activeTab?.isLoading}
        zoomFactor={activeTab?.zoomFactor}
        onClick={() => setIsCommandBarOpen(true)}
        onResetZoom={() => window.dispatchEvent(new CustomEvent('neutrino:zoom-action', { detail: 'reset' }))}
        onOpenFind={() => dispatchSiteAction('open-find')}
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

        {(() => {
          const activeHost = (() => {
            try {
              const parsed = activeTab?.url ? new URL(activeTab.url) : null;
              return parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
                ? parsed.hostname.toLowerCase()
                : '';
            } catch {
              return '';
            }
          })();
          const isSiteWhitelisted =
            !!activeHost &&
            (settings.shieldWhitelist ?? []).some(
              (allowed) => activeHost === allowed || activeHost.endsWith(`.${allowed}`),
            );
          return (
            <button
              className="minimal-pill-btn"
              onClick={() => setIsShieldModalOpen(!isShieldModalOpen)}
              title={
                !settings.adblockEnabled
                  ? `Shields off: ${shieldsBlockedCount} blocked`
                  : isSiteWhitelisted
                    ? `Shields paused on ${activeHost}`
                    : `Shields active: ${shieldsBlockedCount} blocked`
              }
              aria-label="Shields"
              style={
                !settings.adblockEnabled
                  ? { opacity: 0.55 }
                  : isSiteWhitelisted
                    ? { color: '#f59e0b' }
                    : undefined
              }
            >
              <Shield size={14} className="modern-btn-icon" />
              <span>{shieldsBlockedCount}</span>
            </button>
          );
        })()}

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

    {/* Edge-to-Edge Web Canvas Viewport (pulled down on web pages so site controls never collide;
        pushed right of a docked sidebar) */}
    <main className={`arc-viewport-container edge-to-edge ${isWebpage && !isHtmlFullscreen ? 'with-site-top-offset' : ''} ${isSidebarDocked ? 'with-docked-sidebar' : ''} ${spaceTransitionClass} ${isSettingsOpen ? 'settings-page-blur' : ''}`}>
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
          onPageColor={handlePageColor}
        />
      </div>
    </main>

    {/* Google sign-in refused in-app: offer to continue in the default browser */}
    <AuthHandoffNotice />

    {/* Save/update password prompts from login form submissions (R6.2, R6.3, R7.2) */}
    <PasswordPrompt />

    {/* Vertical Pinned Websites Dock (Right Side with macOS Magnification) */}
    {/* Hidden by the Settings toggle; stored pinnedSites stay untouched (R19.2, R19.3) */}
    {settings.rightPinsDockVisible && (
      <RightPinsDock
        onNavigate={navigate}
        isOnWebpage={isWebpage}
        persistedPins={Array.isArray(settings.pinnedSites) ? (settings.pinnedSites as PinnedSite[]) : undefined}
        onPersistPins={(pins) => void updateSettings({ pinnedSites: pins })}
      />
    )}

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
          onNavigate={handleCommandBarNavigate}
          onSelectTab={selectTab}
          onCreateTab={(url) => void createTab(url, state.activeSpaceId)}
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
          onGoBack={() => dispatchSiteAction('back')}
          onGoForward={() => dispatchSiteAction('forward')}
          onReload={() => dispatchSiteAction('reload')}
          onCloseActiveTab={() => {
            if (activeTab?.id) closeTab(activeTab.id);
          }}
          onReopenClosedTab={() => void reopenClosedTab()}
          onOpenFind={() => dispatchSiteAction('open-find')}
          onOpenArchive={() => setIsArchiveOpen(true)}
        />
      </Suspense>
    )}

    {/* Archived Today tabs of the Active_Profile (R16.7, R16.8); opened from the Command_Bar */}
    {isArchiveOpen && (
      <Suspense fallback={null}>
        <ArchiveList isOpen={isArchiveOpen} onClose={() => setIsArchiveOpen(false)} />
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
          activeUrl={activeTab?.url}
          whitelist={settings.shieldWhitelist ?? []}
          onToggleSiteWhitelist={(domainOrUrl) => {
            void window.neutrino?.toggleSiteWhitelist?.(domainOrUrl);
          }}
          onResetStats={resetShieldStats}
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
          userName={userProfile?.name ?? ''}
          onUserNameChange={handleUserNameChange}
          tabs={state.tabs}
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
          partition={activeProfilePartition}
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
          customPresets={settings.customThemePresets || []}
          onChangeCustomPresets={(nextPresets) => void updateSettings({ customThemePresets: nextPresets })}
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
