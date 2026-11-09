import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Space, TabState, ActiveMediaState } from '../types';
import { Homescreen } from './Homescreen';
import { Moon, Sparkles, Globe } from 'lucide-react';

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
}

export const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export function isGoogleAuthUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.includes('accounts.google.com') ||
    url.includes('myaccount.google.com') ||
    url.includes('accounts.youtube.com') ||
    url.includes('oauth2.googleapis.com') ||
    url.includes('apis.google.com/oauth')
  );
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
}) => {
  const webviewRefs = useRef<Record<string, any>>({});
  const attachedListenersRef = useRef<Set<string>>(new Set());
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
      webview.executeJavaScript(`document.querySelector('video, audio')?.play()`).catch(() => {});
    } else if (action === 'pause') {
      webview.executeJavaScript(`document.querySelector('video, audio')?.pause()`).catch(() => {});
    } else if (action === 'seek' && typeof value === 'number') {
      webview.executeJavaScript(`
        const m = document.querySelector('video, audio');
        if (m) m.currentTime = ${value};
      `).catch(() => {});
    } else if (action === 'volume' && typeof value === 'number') {
      webview.executeJavaScript(`
        const m = document.querySelector('video, audio');
        if (m) m.volume = ${Math.max(0, Math.min(1, value))};
      `).catch(() => {});
    }
  }, [mediaCommand, activeMediaTabId, activeTab?.id]);

  // Sync active webview URL navigation
  useEffect(() => {
    if (!activeTab?.url) return;
    if (activeTab.url === 'neutrino://newtab' || activeTab.url === 'about:blank') return;
    const wv = webviewRefs.current[activeTab.id];
    if (wv && wv.loadURL) {
      try {
        const current = wv.getURL?.();
        if (current && current !== activeTab.url && !current.startsWith(activeTab.url)) {
          wv.loadURL(activeTab.url);
        }
      } catch (err) {
        // ignore
      }
    }
  }, [activeTab?.id, activeTab?.url]);

  // Clean up references for closed tabs
  useEffect(() => {
    const currentTabIds = new Set(tabs.map((t) => t.id));
    for (const id of Array.from(attachedListenersRef.current)) {
      if (!currentTabIds.has(id)) {
        attachedListenersRef.current.delete(id);
        delete webviewRefs.current[id];
      }
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
      } catch {
        // ignore
      }
    };

    const injectAdblocking = () => {
      try {
        const u = webview.getURL?.() || '';
        if (u.includes('youtube.com')) {
          webview.executeJavaScript(`
            (() => {
              if (window.__neutrino_ad_skipper_injected) return;
              window.__neutrino_ad_skipper_injected = true;
              const skip = () => {
                try {
                  const v = document.querySelector('video');
                  const ad = document.querySelector('.ad-showing, .ad-interrupting');
                  if (ad && v && !isNaN(v.duration) && isFinite(v.duration)) {
                    v.currentTime = v.duration;
                    v.playbackRate = 16.0;
                  }
                  const btns = document.querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button, .ytp-ad-overlay-close-button');
                  btns.forEach((b) => b.click());
                  const overlays = document.querySelectorAll('.ytp-ad-overlay-container, ytd-ad-slot-renderer, #player-ads');
                  overlays.forEach((el) => { el.style.display = 'none'; });
                } catch(e) {}
              };
              // High-efficiency reactive observer instead of aggressive polling
              const obs = new MutationObserver(() => requestAnimationFrame(skip));
              obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
              setInterval(skip, 2000);
            })();
          `).catch(() => {});
        }
      } catch {}
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
      if (e.url) {
        onUpdateTab(tabId, {
          url: e.url,
          canGoBack: webview.canGoBack?.() ?? false,
          canGoForward: webview.canGoForward?.() ?? false,
        });

        if (webview.setUserAgent) webview.setUserAgent(DESKTOP_USER_AGENT);
      }
    };

    const handleMediaPlay = () => checkTabMedia(tabId);
    const handleMediaPause = () => checkTabMedia(tabId);

    const handleNewWindow = (e: any) => {
      if (!e.url) return;

      const url = e.url.toLowerCase();
      const isAuthOrPopup =
        e.disposition === 'new-window' ||
        (e.options && (e.options.width || e.options.height)) ||
        isGoogleAuthUrl(e.url) ||
        url.includes('appleid.apple.com') ||
        url.includes('github.com/login') ||
        url.includes('login.microsoftonline.com') ||
        url.includes('login.live.com') ||
        url.includes('/oauth') ||
        url.includes('/auth') ||
        url.includes('/signin') ||
        url.includes('/signup') ||
        url.includes('/login') ||
        url.includes('auth0.com') ||
        url.includes('clerk.') ||
        url.includes('supabase.co');

      // Allow authentic OAuth and modal popups so window.opener stays connected to parent site
      if (isAuthOrPopup) {
        return;
      }

      e.preventDefault();
      window.neutrino?.createTab(e.url, activeSpaceId);
    };

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

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('page-title-updated', handleTitle);
    webview.addEventListener('page-favicon-updated', handleFavicon);
    webview.addEventListener('did-navigate', handleNav);
    webview.addEventListener('did-navigate-in-page', handleNav);
    webview.addEventListener('media-started-playing', handleMediaPlay);
    webview.addEventListener('media-paused', handleMediaPause);
    webview.addEventListener('new-window', handleNewWindow);
    webview.addEventListener('did-fail-load', handleFailLoad);
    webview.addEventListener('before-input-event', handleBeforeInput);
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

      {/* Keep webviews of all open web tabs alive in the background */}
      {tabs.map((tab) => {
        if (!tab.url || tab.url === 'neutrino://newtab' || tab.url === 'about:blank') {
          return null;
        }

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
                }
              },
              src: tab.url,
              className: 'chromium-webview',
              partition: 'persist:neutrino',
              allowpopups: 'true',
              useragent: DESKTOP_USER_AGENT,
              webpreferences: 'contextIsolation=yes',
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
