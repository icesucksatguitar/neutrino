import React, { useRef, useEffect } from 'react';
import { TabState } from '../types';

interface BrowserViewportProps {
  activeTab?: TabState;
  onUpdateTab: (tabId: string, partial: Partial<TabState>) => void;
  onNavigate: (url: string) => void;
}

export const BrowserViewport: React.FC<BrowserViewportProps> = ({
  activeTab,
  onUpdateTab,
}) => {
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !activeTab) return;

    const handleStartLoading = () => {
      onUpdateTab(activeTab.id, { isLoading: true });
    };

    const handleStopLoading = () => {
      onUpdateTab(activeTab.id, {
        isLoading: false,
        canGoBack: webview.canGoBack?.() ?? false,
        canGoForward: webview.canGoForward?.() ?? false,
      });
    };

    const handleTitleUpdated = (e: any) => {
      if (e.title) {
        onUpdateTab(activeTab.id, { title: e.title });
      }
    };

    const handleFaviconUpdated = (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        onUpdateTab(activeTab.id, { favicon: e.favicons[0] });
      }
    };

    const handleNavigate = (e: any) => {
      if (e.url) {
        onUpdateTab(activeTab.id, {
          url: e.url,
          canGoBack: webview.canGoBack?.() ?? false,
          canGoForward: webview.canGoForward?.() ?? false,
        });
      }
    };

    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('page-title-updated', handleTitleUpdated);
    webview.addEventListener('page-favicon-updated', handleFaviconUpdated);
    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigate);

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading);
      webview.removeEventListener('did-stop-loading', handleStopLoading);
      webview.removeEventListener('page-title-updated', handleTitleUpdated);
      webview.removeEventListener('page-favicon-updated', handleFaviconUpdated);
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigate);
    };
  }, [activeTab?.id]);

  if (!activeTab) {
    return (
      <div className="webview-host" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>No active tab</p>
      </div>
    );
  }

  // If tab is sleeping (Zen mode), show low-memory placeholder
  if (activeTab.isSleeping) {
    return (
      <div className="webview-host" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        backgroundColor: '#070a12',
      }}>
        <div style={{
          width: '54px',
          height: '54px',
          borderRadius: '50%',
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          border: '1px solid var(--zen-blue)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--zen-blue)',
          fontSize: '24px',
        }}>
          💤
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Tab is Sleeping (Zen Mode)</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '340px', textAlign: 'center' }}>
          This background tab was put to sleep to save system memory. Click anywhere to wake it instantly.
        </p>
        <button
          onClick={() => window.neutrino?.toggleSleepTab(activeTab.id)}
          style={{
            backgroundColor: 'var(--accent)',
            color: 'white',
            border: 'none',
            padding: '8px 18px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Wake Tab
        </button>
      </div>
    );
  }

  return (
    <div className="webview-host">
      {/* Real Chromium embedded webview - runs full Chromium engine in child process */}
      {React.createElement('webview', {
        ref: webviewRef,
        src: activeTab.url,
        className: 'chromium-webview',
        partition: 'persist:neutrino',
        allowpopups: 'true',
        webpreferences: 'contextIsolation=yes',
      })}
    </div>
  );
};
