import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Space, TabState, ActiveMediaState, SiteAction } from '../types';
import { Homescreen } from './Homescreen';
import { FindBar } from './FindBar';
import { Moon, Sparkles, Globe, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  WebviewNavState,
  createWebviewNavState,
  nextNavigation,
  recordReportedNavigation,
} from '../utils/webviewNavigation';
import {
  createTrackpadSwipeTracker,
  hasHorizontalScrollRoom,
} from '../utils/trackpadGesture';

interface BrowserViewportProps {
  activeTab?: TabState;
  tabs?: TabState[];
  spaces?: Space[];
  activeSpaceId?: string;
  isDarkMode?: boolean;
  isSidebarOpen?: boolean;
  onSelectSpace?: (spaceId: string) => void;
  onUpdateTab: (tabId: string, partial: Partial<TabState>) => void;
  onNavigate: (url: string) => void;
  onOpenCommandBar?: () => void;
  onMediaStateChange?: (state: ActiveMediaState | null) => void;
  mediaCommand?: { action: string; tabId?: string; value?: number; timestamp: number } | null;
  userName?: string;
  onTopHover?: (isHovering: boolean) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

function hasWebview(url: string | undefined): url is string {
  return !!url && url !== 'neutrino://newtab' && url !== 'about:blank';
}

export const BrowserViewport: React.FC<BrowserViewportProps> = ({
  activeTab,
  tabs = [],
  spaces = [],
  activeSpaceId = '',
  isDarkMode = false,
  isSidebarOpen = false,
  onSelectSpace,
  onUpdateTab,
  onNavigate,
  onOpenCommandBar,
  onMediaStateChange,
  mediaCommand,
  userName,
  onTopHover,
  onFullscreenChange,
}) => {
  const webviewRefs = useRef<Record<string, any>>({});
  const attachedListenersRef = useRef<Set<string>>(new Set());
  const attachedWebviewNodesRef = useRef<WeakSet<object>>(new WeakSet());
  const webviewRefCallbacksRef = useRef<Record<string, (el: any) => void>>({});
  // Per-tab navigation bookkeeping (see utils/webviewNavigation.ts). `initialSrc` is the only value
  // ever given to the webview's src attribute; later navigations use loadURL.
  const navStatesRef = useRef<Record<string, WebviewNavState & { initialSrc: string }>>({});
  const [activeMediaTabId, setActiveMediaTabId] = useState<string | null>(null);
  const [zoomIndicator, setZoomIndicator] = useState<{ factor: number; visible: boolean }>({
    factor: 1.0,
    visible: false,
  });
  const zoomTimerRef = useRef<any>(null);
  const tabZoomMap = useRef<Record<string, number>>({});
  const hostRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<TabState | undefined>(activeTab);
  const onNavigateRef = useRef(onNavigate);
  const lastHardwareNavRef = useRef<{ at: number; action: 'back' | 'forward' } | null>(null);
  const hostSwipeTrackerRef = useRef(createTrackpadSwipeTracker());
  const swipeHideTimerRef = useRef<number | null>(null);

  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findState, setFindState] = useState<{ activeMatch: number; totalMatches: number }>({
    activeMatch: 0,
    totalMatches: 0,
  });
  const [swipeIndicator, setSwipeIndicator] = useState<{
    direction: 'back' | 'forward';
    progress: number;
    visible: boolean;
    enabled: boolean;
  }>({ direction: 'back', progress: 0, visible: false, enabled: false });

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  const hideSwipeIndicator = useCallback(() => {
    if (swipeHideTimerRef.current) {
      window.clearTimeout(swipeHideTimerRef.current);
      swipeHideTimerRef.current = null;
    }
    setSwipeIndicator((prev) => (prev.visible ? { ...prev, visible: false, progress: 0 } : prev));
  }, []);

  const showSwipeProgress = useCallback((direction: 'back' | 'forward', progress: number, enabled: boolean) => {
    if (swipeHideTimerRef.current) {
      window.clearTimeout(swipeHideTimerRef.current);
    }
    setSwipeIndicator({ direction, progress, visible: true, enabled });
    swipeHideTimerRef.current = window.setTimeout(() => {
      setSwipeIndicator((prev) => ({ ...prev, visible: false, progress: 0 }));
      swipeHideTimerRef.current = null;
    }, 320);
  }, []);

  const closeFindBar = useCallback(() => {
    setIsFindOpen(false);
    setFindState({ activeMatch: 0, totalMatches: 0 });
    const tab = activeTabRef.current;
    const wv = tab ? webviewRefs.current[tab.id] : null;
    try {
      wv?.stopFindInPage?.('clearSelection');
    } catch { }
  }, []);

  const executeSiteAction = useCallback(
    (action: SiteAction, source?: string) => {
      const hardwareSources = ['app-command', 'swipe', 'guest-wheel', 'host-wheel', 'guest-xbutton', 'host-auxclick'];
      if (source && hardwareSources.includes(source) && (action === 'back' || action === 'forward')) {
        const now = Date.now();
        const prev = lastHardwareNavRef.current;
        if (prev && prev.action === action && now - prev.at < 150) {
          return;
        }
        lastHardwareNavRef.current = { at: now, action };
      }

      const tab = activeTabRef.current;
      if (!tab) return;
      const wv = webviewRefs.current[tab.id];
      const hasLiveWebview = hasWebview(tab.url) && !tab.isSleeping && Boolean(wv);

      switch (action) {
        case 'back':
          if (hasLiveWebview) {
            try {
              if (wv.canGoBack?.()) wv.goBack();
            } catch { }
          }
          break;
        case 'forward':
          if (hasLiveWebview) {
            try {
              if (wv.canGoForward?.()) wv.goForward();
            } catch { }
          }
          break;
        case 'reload':
          if (hasLiveWebview) {
            try {
              wv.reload?.();
            } catch { }
          }
          break;
        case 'hard-reload':
          if (hasLiveWebview) {
            try {
              if (wv.reloadIgnoringCache) wv.reloadIgnoringCache();
              else wv.reload?.();
            } catch { }
          }
          break;
        case 'stop':
          if (hasLiveWebview) {
            try {
              wv.stop?.();
            } catch { }
            onUpdateTab(tab.id, { isLoading: false });
          }
          break;
        case 'home':
          closeFindBar();
          if (hasWebview(tab.url)) {
            onNavigateRef.current('neutrino://newtab');
          }
          break;
        case 'open-find':
          if (hasLiveWebview) {
            setIsFindOpen(true);
          }
          break;
      }
    },
    [closeFindBar, onUpdateTab],
  );

  // Unified Zoom Controller
  const changeZoom = useCallback(
    (direction: 'in' | 'out' | 'reset' | number) => {
      if (!activeTab) return;
      const webview = webviewRefs.current[activeTab.id];
      const current = tabZoomMap.current[activeTab.id] ?? activeTab.zoomFactor ?? 1.0;
      let next = current;

      if (typeof direction === 'number') {
        next = direction;
      } else if (direction === 'in') {
        next = Math.min(3.0, Math.round((current + 0.1) * 10) / 10);
      } else if (direction === 'out') {
        next = Math.max(0.3, Math.round((current - 0.1) * 10) / 10);
      } else if (direction === 'reset') {
        next = 1.0;
      }

      tabZoomMap.current[activeTab.id] = next;
      const isNewTab =
        !activeTab.url || activeTab.url === 'neutrino://newtab' || activeTab.url === 'about:blank';
      if (!isNewTab && webview?.setZoomFactor) {
        try {
          webview.setZoomFactor(next);
        } catch {
          // ignore
        }
      }
      onUpdateTab(activeTab.id, { zoomFactor: next });

      setZoomIndicator({ factor: next, visible: true });
      if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
      zoomTimerRef.current = setTimeout(() => {
        setZoomIndicator((prev) => ({ ...prev, visible: false }));
      }, 2400);
    },
    [activeTab, onUpdateTab]
  );

  // Sync with main process zoom updates
  useEffect(() => {
    if (!window.neutrino?.onZoomUpdated) return;
    const unsub = window.neutrino.onZoomUpdated((data) => {
      if (activeTab) {
        tabZoomMap.current[activeTab.id] = data.zoomFactor;
        setZoomIndicator({ factor: data.zoomFactor, visible: true });
        if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
        zoomTimerRef.current = setTimeout(() => {
          setZoomIndicator((prev) => ({ ...prev, visible: false }));
        }, 2400);
      }
    });
    return () => unsub?.();
  }, [activeTab]);

  // Close FindBar when switching tabs or returning to New Tab
  useEffect(() => {
    closeFindBar();
  }, [activeTab?.id, activeTab?.url, closeFindBar]);

  // Listen to authoritative site actions from main process (toolbar IPC, shortcuts, app-command, swipe)
  // and in-page renderer triggers (Command Bar, FloatingUrlPill).
  useEffect(() => {
    const unsubIpc = window.neutrino?.onSiteAction?.((payload) => {
      if (payload?.action) {
        executeSiteAction(payload.action as SiteAction, payload.source);
      }
    });
    const handleCustomAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action?: SiteAction; source?: string }>).detail;
      if (detail?.action) {
        executeSiteAction(detail.action, detail.source ?? 'ui');
      }
    };
    window.addEventListener('neutrino:site-action', handleCustomAction);
    const handleZoomAction = (e: Event) => {
      const dir = (e as CustomEvent<'in' | 'out' | 'reset'>).detail;
      if (dir) {
        changeZoom(dir);
        if (dir === 'reset') {
          window.neutrino?.setZoomFactor?.(1.0);
        }
      }
    };
    window.addEventListener('neutrino:zoom-action', handleZoomAction);
    const unsubEsc = window.neutrino?.onEscapePressed?.(() => {
      closeFindBar();
    });
    return () => {
      unsubIpc?.();
      unsubEsc?.();
      window.removeEventListener('neutrino:site-action', handleCustomAction);
      window.removeEventListener('neutrino:zoom-action', handleZoomAction);
    };
  }, [executeSiteAction, closeFindBar, changeZoom]);

  // Update Chromium find-in-page results live as user types in FindBar
  const handleFindQueryChange = useCallback((nextQuery: string) => {
    setFindQuery(nextQuery);
    const tab = activeTabRef.current;
    const wv = tab ? webviewRefs.current[tab.id] : null;
    if (!wv || !hasWebview(tab?.url) || tab?.isSleeping) return;
    try {
      if (nextQuery.length > 0) {
        wv.findInPage?.(nextQuery);
      } else {
        wv.stopFindInPage?.('clearSelection');
        setFindState({ activeMatch: 0, totalMatches: 0 });
      }
    } catch { }
  }, []);

  const handleFindNext = useCallback(() => {
    const tab = activeTabRef.current;
    const wv = tab ? webviewRefs.current[tab.id] : null;
    if (!wv || !findQuery) return;
    try {
      wv.findInPage?.(findQuery, { forward: true, findNext: true });
    } catch { }
  }, [findQuery]);

  const handleFindPrev = useCallback(() => {
    const tab = activeTabRef.current;
    const wv = tab ? webviewRefs.current[tab.id] : null;
    if (!wv || !findQuery) return;
    try {
      wv.findInPage?.(findQuery, { forward: false, findNext: true });
    } catch { }
  }, [findQuery]);

  // Host-level wheel & mouse XButton handler (covers Homescreen / sleeping overlay borders)
  useEffect(() => {
    const hostEl = hostRef.current;
    if (!hostEl) return;

    const handleHostWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const tab = activeTabRef.current;
      const wv = tab ? webviewRefs.current[tab.id] : null;
      const atBoundaryX = !hasHorizontalScrollRoom(e.target, e.deltaX);
      const res = hostSwipeTrackerRef.current.feedWheel({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        now: performance.now(),
        atBoundaryX,
        canGoBack: Boolean(wv?.canGoBack?.()),
        canGoForward: Boolean(wv?.canGoForward?.()),
      });
      if (res.trigger) {
        hideSwipeIndicator();
        executeSiteAction(res.trigger, 'host-wheel');
      } else if (res.visual) {
        const enabled = res.visual.direction === 'back' ? Boolean(wv?.canGoBack?.()) : Boolean(wv?.canGoForward?.());
        showSwipeProgress(res.visual.direction, res.visual.progress, enabled);
      } else {
        hideSwipeIndicator();
      }
    };

    const handleHostMouseButton = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        executeSiteAction('back', 'host-auxclick');
      } else if (e.button === 4) {
        e.preventDefault();
        executeSiteAction('forward', 'host-auxclick');
      }
    };

    hostEl.addEventListener('wheel', handleHostWheel, { passive: true });
    hostEl.addEventListener('auxclick', handleHostMouseButton);
    hostEl.addEventListener('mouseup', handleHostMouseButton);
    return () => {
      hostEl.removeEventListener('wheel', handleHostWheel);
      hostEl.removeEventListener('auxclick', handleHostMouseButton);
      hostEl.removeEventListener('mouseup', handleHostMouseButton);
      if (swipeHideTimerRef.current) window.clearTimeout(swipeHideTimerRef.current);
    };
  }, [executeSiteAction, hideSwipeIndicator, showSwipeProgress]);

  // Handle Ctrl + Wheel zooming on the canvas
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          changeZoom('in');
        } else if (e.deltaY > 0) {
          changeZoom('out');
        }
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [changeZoom]);

  // Poll / Query media state from webviews
  const checkTabMedia = useCallback(async (tabId: string) => {
    const webview = webviewRefs.current[tabId];
    if (!webview) return;

    try {
      const res = await webview.executeJavaScript(`
        (() => {
          const mediaElements = Array.from(document.querySelectorAll('video, audio'));
          for (const m of mediaElements) {
            // Must not be paused or ended
            if (m.paused || m.ended) continue;
            // Must not be muted and volume must be > 5%
            if (m.muted || m.volume < 0.05) continue;
            // Must have real media duration (at least 15s or infinite livestream)
            const d = m.duration;
            const isLive = d === Infinity || isNaN(d);
            if (!isLive && d < 15) continue;
            // Must have played past initial 0.5s
            if ((m.currentTime || 0) < 0.5) continue;
            // Must be visible if video
            if (m.tagName.toLowerCase() === 'video') {
              const rect = m.getBoundingClientRect();
              if (rect.width < 120 || rect.height < 80) continue;
            }

            return {
              hasVideo: m.tagName.toLowerCase() === 'video',
              isPlaying: true,
              currentTime: m.currentTime || 0,
              duration: isLive ? 0 : (d || 0),
              volume: m.volume ?? 1,
              tabTitle: document.title || 'Media Player'
            };
          }
          return null;
        })()
      `);

      if (res && res.isPlaying) {
        setActiveMediaTabId(tabId);
        window.neutrino?.mediaControl?.('report-status', { tabId, isPlaying: true });
        if (onMediaStateChange) {
          onMediaStateChange({
            tabId,
            tabTitle: res.tabTitle,
            url: webview.getURL?.() || '',
            isPlaying: res.isPlaying,
            currentTime: res.currentTime,
            duration: res.duration,
            volume: res.volume,
            hasVideo: res.hasVideo,
          });
        }
      } else if (activeMediaTabId === tabId) {
        setActiveMediaTabId(null);
        window.neutrino?.mediaControl?.('report-status', { tabId, isPlaying: false });
        if (onMediaStateChange) {
          onMediaStateChange(null);
        }
      }
    } catch {
      // ignore
    }
  }, [activeMediaTabId, onMediaStateChange]);

  // Relaxed media progress updater: only monitors the single tab actually playing media
  useEffect(() => {
    if (!activeMediaTabId) return;
    const timer = setInterval(() => {
      checkTabMedia(activeMediaTabId);
    }, 2500);
    return () => clearInterval(timer);
  }, [activeMediaTabId, checkTabMedia]);

  // Handle media commands from mini player or MCP
  useEffect(() => {
    if (!mediaCommand) return;
    const targetTabId = mediaCommand.tabId || activeMediaTabId || activeTab?.id;
    if (!targetTabId) return;

    const webview = webviewRefs.current[targetTabId];
    if (!webview) return;

    const { action, value } = mediaCommand;
    if (action === 'play') {
      webview.executeJavaScript(`document.querySelector('video, audio')?.play()`).catch(() => { });
    } else if (action === 'pause') {
      webview.executeJavaScript(`document.querySelector('video, audio')?.pause()`).catch(() => { });
    } else if (action === 'seek' && typeof value === 'number') {
      webview.executeJavaScript(`
        const m = document.querySelector('video, audio');
        if (m) m.currentTime = ${value};
      `).catch(() => { });
    } else if (action === 'volume' && typeof value === 'number') {
      webview.executeJavaScript(`
        const m = document.querySelector('video, audio');
        if (m) m.volume = ${Math.max(0, Math.min(1, value))};
      `).catch(() => { });
    }
  }, [mediaCommand, activeMediaTabId, activeTab?.id]);

  // Navigate a tab's webview only when its URL was changed by the user or the app (omnibox, MCP,
  // links opened as tabs), never in response to the webview's own navigations. Echoing those back
  // reloads the page and replays one-time URLs such as OAuth callbacks.
  useEffect(() => {
    for (const tab of tabs) {
      const state = navStatesRef.current[tab.id];
      if (!state || !hasWebview(tab.url)) continue;
      const target = nextNavigation(state, tab.url);
      if (!target) continue;
      const wv = webviewRefs.current[tab.id];
      if (!wv) continue;
      try {
        const pending = wv.loadURL(target);
        if (pending && typeof pending.catch === 'function') pending.catch(() => { });
      } catch {
        // Guest not ready yet (before its first dom-ready): navigate through the attribute instead.
        wv.setAttribute('src', target);
      }
    }
  }, [tabs]);

  // Clean up references for closed tabs and for tabs whose webview is no longer rendered
  useEffect(() => {
    const liveWebviewTabIds = new Set(tabs.filter((t) => hasWebview(t.url)).map((t) => t.id));
    for (const id of Array.from(attachedListenersRef.current)) {
      if (!liveWebviewTabIds.has(id)) {
        attachedListenersRef.current.delete(id);
        delete webviewRefs.current[id];
      }
    }
    for (const id of Object.keys(navStatesRef.current)) {
      if (!liveWebviewTabIds.has(id)) delete navStatesRef.current[id];
    }
  }, [tabs]);

  // Attach event listeners cleanly once per underlying <webview> DOM node
  const attachWebviewEvents = (tabId: string, webview: any) => {
    if (!webview || attachedWebviewNodesRef.current.has(webview)) return;
    attachedWebviewNodesRef.current.add(webview);
    attachedListenersRef.current.add(tabId);

    const readNavCapabilities = (): Partial<TabState> => {
      try {
        return {
          canGoBack: Boolean(webview.canGoBack?.()),
          canGoForward: Boolean(webview.canGoForward?.()),
        };
      } catch {
        // WebView throws if queried before guest dom-ready attaches
        return {};
      }
    };

    // Restore zoom and attach guest UX detectors on dom-ready
    const handleDomReady = () => {
      try {
        const factor = tabZoomMap.current[tabId] ?? activeTabRef.current?.zoomFactor ?? 1.0;
        if (webview.setZoomFactor) webview.setZoomFactor(factor);
        injectTopHoverDetector();
        injectTrackpadSwipeDetector();
        const caps = readNavCapabilities();
        if (Object.keys(caps).length > 0) {
          onUpdateTab(tabId, caps);
        }
      } catch {
        // ignore
      }
    };

    const injectTrackpadSwipeDetector = () => {
      try {
        webview.executeJavaScript(`
          (() => {
            if (window.__neutrino_gesture_detector_installed) return;
            window.__neutrino_gesture_detector_installed = true;
            const THRESHOLD = 150;
            const IDLE_MS = 220;
            const COOLDOWN_MS = 700;
            let accum = 0;
            let lastTs = 0;
            let cooldownUntil = 0;
            let lastRatio = 0;
            let shown = false;

            const hasScrollRoom = (target, deltaX) => {
              if (!deltaX) return false;
              let el = target && target.nodeType === 1 ? target : null;
              while (el) {
                const style = window.getComputedStyle(el);
                if (style) {
                  const ox = style.overflowX;
                  if ((ox === 'auto' || ox === 'scroll' || ox === 'overlay') && el.scrollWidth > el.clientWidth + 1) {
                    if (deltaX < 0 && el.scrollLeft > 1) return true;
                    if (deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
                  }
                }
                el = el.parentElement;
              }
              const se = document.scrollingElement;
              if (se && se.scrollWidth > se.clientWidth + 1) {
                if (deltaX < 0 && se.scrollLeft > 1) return true;
                if (deltaX > 0 && se.scrollLeft + se.clientWidth < se.scrollWidth - 1) return true;
              }
              return false;
            };

            const cancel = () => {
              accum = 0;
              lastRatio = 0;
              if (shown) {
                shown = false;
                console.log('__neutrino_swipe:cancel');
              }
            };

            window.addEventListener('wheel', (e) => {
              if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
              const dx = e.deltaX || 0;
              const dy = e.deltaY || 0;
              const now = performance.now();
              if (now < cooldownUntil) return;
              if (Math.abs(dx) < 2.5 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
              if (hasScrollRoom(e.target, dx)) {
                cancel();
                return;
              }
              if (now - lastTs > IDLE_MS || (accum !== 0 && Math.sign(dx) !== Math.sign(accum))) {
                accum = 0;
                lastRatio = 0;
              }
              lastTs = now;
              accum += dx;
              const ratio = Math.min(1, Math.abs(accum) / THRESHOLD);
              const dir = accum < 0 ? 'back' : 'forward';
              if (ratio >= 1) {
                accum = 0;
                lastRatio = 0;
                shown = false;
                cooldownUntil = now + COOLDOWN_MS;
                console.log('__neutrino_swipe:trigger:' + dir);
              } else if (ratio >= 0.14 && Math.abs(ratio - lastRatio) >= 0.08) {
                lastRatio = ratio;
                shown = true;
                console.log('__neutrino_swipe:progress:' + dir + ':' + ratio.toFixed(2));
              }
            }, { passive: true });

            const onMouseNav = (e) => {
              if (e.button === 3) {
                e.preventDefault();
                console.log('__neutrino_xbutton:back');
              } else if (e.button === 4) {
                e.preventDefault();
                console.log('__neutrino_xbutton:forward');
              }
            };
            window.addEventListener('auxclick', onMouseNav);
            window.addEventListener('mouseup', onMouseNav);
          })();
        `).catch(() => { });
      } catch { }
    };

    const injectTopHoverDetector = () => {
      try {
        webview.executeJavaScript(`
          (() => {
            if (window.__neutrino_top_detector_installed) return;
            window.__neutrino_top_detector_installed = true;
            let wasNearTop = false;
            window.addEventListener('mousemove', (e) => {
              const isNearTop = e.clientY <= 36;
              if (isNearTop && !wasNearTop) {
                wasNearTop = true;
                console.log('__neutrino_top_hover:enter');
              } else if (!isNearTop && wasNearTop && e.clientY > 80) {
                wasNearTop = false;
                console.log('__neutrino_top_hover:leave');
              }
            }, { passive: true });
          })();
        `).catch(() => { });
      } catch { }
    };

    const handleStartLoading = () => onUpdateTab(tabId, { isLoading: true });
    const handleStopLoading = () => {
      onUpdateTab(tabId, {
        isLoading: false,
        ...readNavCapabilities(),
      });
    };

    const handleFinishLoad = () => {
      const caps = readNavCapabilities();
      if (Object.keys(caps).length > 0) {
        onUpdateTab(tabId, caps);
      }
    };

    const handleTitle = (e: any) => {
      if (e.title) onUpdateTab(tabId, { title: e.title });
    };

    const handleFavicon = (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        onUpdateTab(tabId, { favicon: e.favicons[0] });
      }
    };

    const handleNav = (e: any) => {
      // did-navigate-in-page also fires for iframes; only the main frame is the tab's URL.
      if (!e.url || e.isMainFrame === false) return;
      const state = navStatesRef.current[tabId];
      if (state) recordReportedNavigation(state, e.url);
      onUpdateTab(tabId, {
        url: e.url,
        ...readNavCapabilities(),
      });
    };

    const handleMediaPlay = () => checkTabMedia(tabId);
    const handleMediaPause = () => checkTabMedia(tabId);

    const handleFailLoad = (e: any) => {
      if (e.errorCode !== -3) {
        console.warn('Webview failed to load:', e.validatedURL, e.errorDescription);
      }
    };

    const handleFoundInPage = (e: any) => {
      if (tabId !== activeTabRef.current?.id) return;
      const res = e?.result;
      if (!res) return;
      setFindState({
        activeMatch: res.activeMatchOrdinal ?? 0,
        totalMatches: res.matches ?? 0,
      });
    };

    const handleConsoleMessage = (e: any) => {
      const msg: string = e?.message || '';
      if (msg === '__neutrino_top_hover:enter') {
        onTopHover?.(true);
      } else if (msg === '__neutrino_top_hover:leave') {
        onTopHover?.(false);
      } else if (tabId === activeTabRef.current?.id && msg.startsWith('__neutrino_swipe:')) {
        const parts = msg.split(':');
        const kind = parts[1];
        if (kind === 'cancel') {
          hideSwipeIndicator();
        } else if (kind === 'trigger') {
          const dir = parts[2] === 'forward' ? 'forward' : 'back';
          hideSwipeIndicator();
          executeSiteAction(dir, 'guest-wheel');
        } else if (kind === 'progress') {
          const dir = parts[2] === 'forward' ? 'forward' : 'back';
          const ratio = Math.max(0, Math.min(1, Number(parts[3]) || 0));
          const enabled = dir === 'back' ? Boolean(webview.canGoBack?.()) : Boolean(webview.canGoForward?.());
          showSwipeProgress(dir, ratio, enabled);
        }
      } else if (tabId === activeTabRef.current?.id && msg === '__neutrino_xbutton:back') {
        executeSiteAction('back', 'guest-xbutton');
      } else if (tabId === activeTabRef.current?.id && msg === '__neutrino_xbutton:forward') {
        executeSiteAction('forward', 'guest-xbutton');
      }
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-finish-load', handleFinishLoad);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('page-title-updated', handleTitle);
    webview.addEventListener('page-favicon-updated', handleFavicon);
    webview.addEventListener('did-navigate', handleNav);
    webview.addEventListener('did-navigate-in-page', handleNav);
    webview.addEventListener('media-started-playing', handleMediaPlay);
    webview.addEventListener('media-paused', handleMediaPause);
    webview.addEventListener('did-fail-load', handleFailLoad);
    webview.addEventListener('found-in-page', handleFoundInPage);
    webview.addEventListener('console-message', handleConsoleMessage);
    webview.addEventListener('enter-html-full-screen', () => {
      onFullscreenChange?.(true);
    });
    webview.addEventListener('leave-html-full-screen', () => {
      onFullscreenChange?.(false);
    });
  };

  const getWebviewRef = (tabId: string) => {
    if (!webviewRefCallbacksRef.current[tabId]) {
      webviewRefCallbacksRef.current[tabId] = (el: any) => {
        if (el) {
          webviewRefs.current[tabId] = el;
          attachWebviewEvents(tabId, el);
        } else {
          delete webviewRefs.current[tabId];
          attachedListenersRef.current.delete(tabId);
        }
      };
    }
    return webviewRefCallbacksRef.current[tabId];
  };

  if (!activeTab) {
    return (
      <div className="webview-host empty-state">
        <p className="empty-message">No active tab</p>
      </div>
    );
  }

  const isCurrentTabNewTab =
    !activeTab.url || activeTab.url === 'neutrino://newtab' || activeTab.url === 'about:blank';

  return (
    <div className="webview-host" ref={hostRef}>
      <FindBar
        isOpen={isFindOpen && !isCurrentTabNewTab && !activeTab.isSleeping}
        query={findQuery}
        activeMatch={findState.activeMatch}
        totalMatches={findState.totalMatches}
        onQueryChange={handleFindQueryChange}
        onNext={handleFindNext}
        onPrev={handleFindPrev}
        onClose={closeFindBar}
      />

      {swipeIndicator.visible && (
        <div
          className={`swipe-nav-indicator ${swipeIndicator.direction} ${swipeIndicator.enabled ? 'ready' : 'unavailable'} ${swipeIndicator.progress >= 0.85 ? 'primed' : ''}`}
          aria-hidden="true"
          style={{
            opacity: Math.min(1, 0.35 + swipeIndicator.progress * 0.65),
            transform:
              swipeIndicator.direction === 'back'
                ? `translateY(-50%) translateX(${Math.round(swipeIndicator.progress * 26)}px) scale(${0.86 + swipeIndicator.progress * 0.14})`
                : `translateY(-50%) translateX(${-Math.round(swipeIndicator.progress * 26)}px) scale(${0.86 + swipeIndicator.progress * 0.14})`,
          }}
        >
          {swipeIndicator.direction === 'back' ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
        </div>
      )}

      {/* If active tab is Homescreen, render homescreen */}
      {isCurrentTabNewTab && !activeTab.isSleeping && (
        <Homescreen
          isDarkMode={isDarkMode}
          onNavigate={onNavigate}
          onOpenCommandBar={onOpenCommandBar}
          userName={userName}
        />
      )}

      {/* If active tab is sleeping (Zen mode), show low-memory placeholder */}
      {activeTab.isSleeping && (
        <div
          className="zen-sleeping-screen"
          onClick={() => window.neutrino?.toggleSleepTab(activeTab.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              window.neutrino?.toggleSleepTab(activeTab.id);
            }
          }}
          title="Click anywhere to wake tab"
        >
          <div className="zen-sleeping-ambient-glow" />

          <div className="zen-sleeping-card" onClick={(e) => e.stopPropagation()}>
            <div className="zen-sleeping-icon-ring">
              <Moon className="zen-sleeping-moon" size={26} strokeWidth={1.75} />
              <span className="zen-sleeping-orbit" />
            </div>

            <div className="zen-sleeping-badge">
              <span className="zen-sleeping-dot" />
              <span>Zen Memory Saver</span>
            </div>

            <h2 className="zen-sleeping-title">
              {activeTab.title && activeTab.title !== 'neutrino://newtab' ? activeTab.title : 'Tab is Sleeping'}
            </h2>

            {activeTab.url && activeTab.url !== 'neutrino://newtab' && activeTab.url !== 'about:blank' && (
              <div className="zen-sleeping-url-pill">
                <Globe size={12} className="zen-sleeping-globe" />
                <span className="zen-sleeping-url-text">
                  {(() => {
                    try {
                      return new URL(activeTab.url).hostname;
                    } catch {
                      return activeTab.url;
                    }
                  })()}
                </span>
              </div>
            )}

            <p className="zen-sleeping-desc">
              This tab was placed into deep sleep to free up CPU and system memory. Your exact scroll position and page state are preserved.
            </p>

            <button
              type="button"
              className="zen-sleeping-wake-btn"
              onClick={(e) => {
                e.stopPropagation();
                window.neutrino?.toggleSleepTab(activeTab.id);
              }}
            >
              <Sparkles size={15} />
              <span>Wake Tab</span>
            </button>

            <div className="zen-sleeping-hint">
              Click anywhere to resume instantly
            </div>
          </div>
        </div>
      )}

      {/* Mount webviews only for non-sleeping web tabs so sleeping genuinely frees renderer RAM */}
      {tabs.map((tab) => {
        if (!hasWebview(tab.url) || tab.isSleeping) {
          if (tab.isSleeping) {
            delete navStatesRef.current[tab.id];
            delete webviewRefs.current[tab.id];
            attachedListenersRef.current.delete(tab.id);
          }
          return null;
        }

        if (!navStatesRef.current[tab.id]) {
          navStatesRef.current[tab.id] = { ...createWebviewNavState(tab.url), initialSrc: tab.url };
        }
        const initialSrc = navStatesRef.current[tab.id].initialSrc;

        const isActive = tab.id === activeTab.id && !tab.isSleeping;

        return (
          <div
            key={tab.id}
            className={`tab-webview-wrapper ${isActive ? 'active' : 'inactive'}`}
            style={
              isActive
                ? {
                  display: 'flex',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: '100%',
                  height: '100%',
                  minWidth: '100%',
                  minHeight: '100%',
                  zIndex: 1,
                }
                : {
                  display: 'none',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 0,
                }
            }
          >
            {React.createElement('webview', {
              ref: getWebviewRef(tab.id),
              src: initialSrc,
              className: 'chromium-webview',
              partition: 'persist:neutrino',
              allowpopups: 'true',
              webpreferences: 'contextIsolation=yes,nodeIntegration=no,spellcheck=no,backgroundThrottling=yes',
              style: {
                display: 'inline-flex',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
                minWidth: '100%',
                minHeight: '100%',
                border: 'none',
                outline: 'none',
                backgroundColor: '#ffffff',
              },
            })}
          </div>
        );
      })}
    </div>
  );
};
