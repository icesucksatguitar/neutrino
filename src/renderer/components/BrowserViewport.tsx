import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Space, TabState, ActiveMediaState } from '../types';
import { Homescreen } from './Homescreen';
import { Moon, Sparkles, Globe } from 'lucide-react';
import {
  WebviewNavState,
  createWebviewNavState,
  nextNavigation,
  recordReportedNavigation,
} from '../utils/webviewNavigation';

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

  // The main process owns page dark mode; it re-applies it to every webview on this call
  useEffect(() => {
    window.neutrino?.setThemeMode?.(isDarkMode ? 'dark' : 'light');
  }, [isDarkMode, activeTab?.id]);

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

  // Attach event listeners for each tab webview (guaranteed strictly once per webview)
  const attachWebviewEvents = (tabId: string, webview: any) => {
    if (!webview || attachedListenersRef.current.has(tabId)) return;
    attachedListenersRef.current.add(tabId);

    // Optional styling for PDF viewers without overriding native web styling
    const injectPdfViewerDarkTheme = async () => {
      if (!isDarkMode) return;
      try {
        const u = webview.getURL?.() || '';
        const isPdf =
          u.toLowerCase().endsWith('.pdf') ||
          u.toLowerCase().includes('.pdf?') ||
          u.toLowerCase().includes('application/pdf');

        if (isPdf) {
          // Force dark theme only on native PDF viewer
          await webview.insertCSS(`
            html, body, #viewer, #viewerContainer, embed, object, pdf-viewer, viewer-pdf-toolbar {
              filter: invert(90%) hue-rotate(180deg) contrast(95%) !important;
              background-color: #18191c !important;
            }
          `);
        }
      } catch {
        // ignore injection errors
      }
    };

    // Restore zoom and apply theme on dom-ready
    const handleDomReady = () => {
      try {
        const factor = tabZoomMap.current[tabId] ?? activeTab?.zoomFactor ?? 1.0;
        if (webview.setZoomFactor) webview.setZoomFactor(factor);
        injectPdfViewerDarkTheme();
        injectAdblocking();
        injectTopHoverDetector();
      } catch {
        // ignore
      }
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
        `).catch(() => {});
      } catch {}
    };

    const injectAdblocking = () => {
      try {
        const u = webview.getURL?.() || '';
        if (u.includes('youtube.com')) {
          webview.executeJavaScript(`
            (() => {
              if (window.__neutrino_ad_skipper_injected) return;
              window.__neutrino_ad_skipper_injected = true;
              let isSkipping = false;
              const skip = () => {
                if (isSkipping) return;
                isSkipping = true;
                try {
                  const btns = document.querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button, .ytp-ad-overlay-close-button');
                  btns.forEach((b) => {
                    if (b && typeof b.click === 'function') b.click();
                  });
                  const overlays = document.querySelectorAll('.ytp-ad-overlay-container, ytd-ad-slot-renderer, #player-ads');
                  overlays.forEach((el) => { if (el && el.style) el.style.display = 'none'; });
                } catch(e) {}
                setTimeout(() => { isSkipping = false; }, 800);
              };
              const obs = new MutationObserver(skip);
              if (document.body) {
                obs.observe(document.body, { childList: true, subtree: true });
              }
              setInterval(skip, 1500);
            })();
          `).catch(() => { });
        }
      } catch { }
    };

    const handleStartLoading = () => onUpdateTab(tabId, { isLoading: true });
    const handleStopLoading = () => {
      onUpdateTab(tabId, {
        isLoading: false,
        canGoBack: webview.canGoBack?.() ?? false,
        canGoForward: webview.canGoForward?.() ?? false,
      });
      injectPdfViewerDarkTheme();
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
        canGoBack: webview.canGoBack?.() ?? false,
        canGoForward: webview.canGoForward?.() ?? false,
      });
    };

    const handleMediaPlay = () => checkTabMedia(tabId);
    const handleMediaPause = () => checkTabMedia(tabId);

    const handleFailLoad = (e: any) => {
      if (e.errorCode !== -3) {
        console.warn('Webview failed to load:', e.validatedURL, e.errorDescription);
      }
    };

    const handleBeforeInput = (e: any) => {
      const input = e?.input || e;
      if (input.type === 'keyDown' || e.type === 'keydown') {
        if (input.key === 'Escape' || e.key === 'Escape') {
          window.dispatchEvent(new CustomEvent('neutrino:toggle-tabs', { detail: { open: false } }));
          window.dispatchEvent(new CustomEvent('neutrino:close-command-bar'));
          return;
        }
        if (input.control || input.meta || e.ctrlKey || e.metaKey) {
          const k = (input.key || e.key || '').toLowerCase();
          if (k === 'e') {
            if (e.preventDefault) e.preventDefault();
            window.dispatchEvent(new CustomEvent('neutrino:toggle-tabs'));
          } else if (k === 'w') {
            if (e.preventDefault) e.preventDefault();
            window.dispatchEvent(new CustomEvent('neutrino:close-active-tab'));
          } else if (k === 't') {
            if (e.preventDefault) e.preventDefault();
            window.neutrino?.createTab?.('neutrino://newtab', activeSpaceId);
            onOpenCommandBar?.();
          } else if (k === 'k' || k === 'l') {
            if (e.preventDefault) e.preventDefault();
            onOpenCommandBar?.();
          }
        }
      }
    };

    const handleConsoleMessage = (e: any) => {
      if (e.message === '__neutrino_top_hover:enter') {
        onTopHover?.(true);
      } else if (e.message === '__neutrino_top_hover:leave') {
        onTopHover?.(false);
      }
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('page-title-updated', handleTitle);
    webview.addEventListener('page-favicon-updated', handleFavicon);
    webview.addEventListener('did-navigate', handleNav);
    webview.addEventListener('did-navigate-in-page', handleNav);
    webview.addEventListener('media-started-playing', handleMediaPlay);
    webview.addEventListener('media-paused', handleMediaPause);
    webview.addEventListener('did-fail-load', handleFailLoad);
    webview.addEventListener('before-input-event', handleBeforeInput);
    webview.addEventListener('console-message', handleConsoleMessage);
    webview.addEventListener('enter-html-full-screen', () => {
      onFullscreenChange?.(true);
    });
    webview.addEventListener('leave-html-full-screen', () => {
      onFullscreenChange?.(false);
    });
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
    <div className="webview-host">
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
                  left: '-9999px',
                  width: '1px',
                  height: '1px',
                  opacity: 0,
                  pointerEvents: 'none',
                  zIndex: 0,
                }
            }
          >
            {React.createElement('webview', {
              ref: (el: any) => {
                if (el) {
                  webviewRefs.current[tab.id] = el;
                  attachWebviewEvents(tab.id, el);
                } else {
                  delete webviewRefs.current[tab.id];
                  attachedListenersRef.current.delete(tab.id);
                }
              },
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
                backgroundColor: isDarkMode ? '#0A0A0B' : '#ffffff',
              },
            })}
          </div>
        );
      })}
    </div>
  );
};
