import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Space, TabState, ActiveMediaState } from '../types';
import { Homescreen } from './Homescreen';

interface BrowserViewportProps {
  activeTab?: TabState;
  tabs?: TabState[];
  spaces?: Space[];
  activeSpaceId?: string;
  onSelectSpace?: (spaceId: string) => void;
  onUpdateTab: (tabId: string, partial: Partial<TabState>) => void;
  onNavigate: (url: string) => void;
  onMediaStateChange?: (state: ActiveMediaState | null) => void;
  mediaCommand?: { action: string; tabId?: string; value?: number; timestamp: number } | null;
}

export const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const BrowserViewport: React.FC<BrowserViewportProps> = ({
  activeTab,
  tabs = [],
  spaces = [],
  activeSpaceId = '',
  onSelectSpace,
  onUpdateTab,
  onNavigate,
  onMediaStateChange,
  mediaCommand,
}) => {
  const webviewRefs = useRef<Record<string, any>>({});
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
      if (webview?.setZoomFactor) {
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

  // Poll / Query media state from webviews
  const checkTabMedia = useCallback(async (tabId: string) => {
    const webview = webviewRefs.current[tabId];
    if (!webview) return;

    try {
      const res = await webview.executeJavaScript(`
        (() => {
          const m = document.querySelector('video, audio');
          if (!m) return null;
          return {
            hasVideo: m.tagName.toLowerCase() === 'video',
            isPlaying: !m.paused && !m.ended && m.readyState > 2,
            currentTime: m.currentTime || 0,
            duration: m.duration || 0,
            volume: m.volume ?? 1,
            tabTitle: document.title || 'Media Player'
          };
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
      } else if (res && !res.isPlaying && activeMediaTabId === tabId) {
        window.neutrino?.mediaControl?.('report-status', { tabId, isPlaying: false });
        if (onMediaStateChange) {
          onMediaStateChange({
            tabId,
            tabTitle: res.tabTitle,
            url: webview.getURL?.() || '',
            isPlaying: false,
            currentTime: res.currentTime,
            duration: res.duration,
            volume: res.volume,
            hasVideo: res.hasVideo,
          });
        }
      }
    } catch {
      // ignore
    }
  }, [activeMediaTabId, onMediaStateChange]);

  // Periodic media heartbeat (every 1.2s)
  useEffect(() => {
    const timer = setInterval(() => {
      for (const tab of tabs) {
        if (tab.url && tab.url !== 'neutrino://newtab' && !tab.isSleeping) {
          checkTabMedia(tab.id);
        }
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [tabs, checkTabMedia]);

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

  // Attach event listeners for each tab webview
  const attachWebviewEvents = (tabId: string, webview: any) => {
    if (!webview) return;

    // Restore zoom and enforce full visual zoom flexibility on dom-ready
    const handleDomReady = () => {
      try {
        const factor = tabZoomMap.current[tabId] ?? activeTab?.zoomFactor ?? 1.0;
        if (webview.setZoomFactor) webview.setZoomFactor(factor);
        if (webview.setVisualZoomLevelLimits) webview.setVisualZoomLevelLimits(0.25, 5.0);
      } catch {
        // ignore
      }
    };

    const handleStartLoading = () => onUpdateTab(tabId, { isLoading: true });
    const handleStopLoading = () => {
      onUpdateTab(tabId, {
        isLoading: false,
        canGoBack: webview.canGoBack?.() ?? false,
        canGoForward: webview.canGoForward?.() ?? false,
      });
      checkTabMedia(tabId);
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
      }
    };

    const handleMediaPlay = () => checkTabMedia(tabId);
    const handleMediaPause = () => checkTabMedia(tabId);

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('page-title-updated', handleTitle);
    webview.addEventListener('page-favicon-updated', handleFavicon);
    webview.addEventListener('did-navigate', handleNav);
    webview.addEventListener('did-navigate-in-page', handleNav);
    webview.addEventListener('media-started-playing', handleMediaPlay);
    webview.addEventListener('media-paused', handleMediaPause);
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
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          onSelectSpace={onSelectSpace}
          onNavigate={onNavigate}
        />
      )}

      {/* If active tab is sleeping (Zen mode), show low-memory placeholder */}
      {activeTab.isSleeping && (
        <div className="tab-sleeping-container">
          <div className="tab-sleeping-badge">💤</div>
          <h3 className="tab-sleeping-title">Tab is Sleeping (Zen Mode)</h3>
          <p className="tab-sleeping-desc">
            This background tab was put to sleep to save system memory. Click anywhere to wake it instantly.
          </p>
          <button
            onClick={() => window.neutrino?.toggleSleepTab(activeTab.id)}
            className="floating-new-tab-btn"
          >
            Wake Tab
          </button>
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
                    flex: '1 1 100%',
                    width: '100%',
                    height: '100%',
                    minWidth: 0,
                    minHeight: 0,
                    position: 'relative',
                  }
                : {
                    display: 'none',
                    width: '1px',
                    height: '1px',
                    position: 'absolute',
                    left: '-9999px',
                    opacity: 0,
                    pointerEvents: 'none',
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
                display: 'flex',
                flex: '1 1 100%',
                width: '100%',
                height: '100%',
                minWidth: 0,
                minHeight: 0,
                border: 'none',
                outline: 'none',
              },
            })}
          </div>
        );
      })}

      {/* Floating Arc Zoom Pill Widget */}
      {(zoomIndicator.visible || (tabZoomMap.current[activeTab.id] && tabZoomMap.current[activeTab.id] !== 1.0)) && (
        <div className={`arc-zoom-pill ${zoomIndicator.visible ? 'visible' : 'compact'}`}>
          <button
            className="arc-zoom-btn"
            onClick={() => changeZoom('out')}
            title="Zoom Out (Ctrl -)"
            aria-label="Zoom Out"
          >
            −
          </button>
          <span
            className="arc-zoom-label"
            onClick={() => changeZoom('reset')}
            title="Click to reset zoom to 100% (Ctrl 0)"
          >
            {Math.round((tabZoomMap.current[activeTab.id] ?? activeTab.zoomFactor ?? 1.0) * 100)}%
          </span>
          <button
            className="arc-zoom-btn"
            onClick={() => changeZoom('in')}
            title="Zoom In (Ctrl +)"
            aria-label="Zoom In"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};
