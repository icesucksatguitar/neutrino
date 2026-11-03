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

  // Periodic media heartbeat (every 1s)
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

  // Handle media commands from mini player or MCP (Section 8)
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
      <div className="webview-host" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>No active tab</p>
      </div>
    );
  }

  const isCurrentTabNewTab = !activeTab.url || activeTab.url === 'neutrino://newtab' || activeTab.url === 'about:blank';

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
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          width: '100%',
          height: '100%',
          backgroundColor: 'var(--bg-app)',
        }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            backgroundColor: 'var(--zen-blue-bg)',
            border: '1px solid var(--zen-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--zen-blue)',
            fontSize: '24px',
          }}>
            💤
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
            Tab is Sleeping (Zen Mode)
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '340px', textAlign: 'center' }}>
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

      {/* Keep webviews of all open web tabs alive in the background (Section 8) */}
      {tabs.map((tab) => {
        if (!tab.url || tab.url === 'neutrino://newtab' || tab.url === 'about:blank') {
          return null;
        }

        const isActive = tab.id === activeTab.id && !tab.isSleeping;

        return (
          <div
            key={tab.id}
            style={
              isActive
                ? { width: '100%', height: '100%', display: 'flex' }
                : { width: '1px', height: '1px', position: 'absolute', left: '-9999px', opacity: 0 }
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
              webpreferences: 'contextIsolation=yes',
            })}
          </div>
        );
      })}
    </div>
  );
};
