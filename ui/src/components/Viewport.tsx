import React from 'react';
import { Tab, ShieldStats } from '../types/browser';
import { NewTabDashboard } from './NewTabDashboard';
import { Shield, ExternalLink, RefreshCw } from 'lucide-react';

interface ViewportProps {
  activeTab: Tab;
  stats: ShieldStats;
  searchEngine: string;
  onNavigate: (url: string) => void;
  onReload: () => void;
}

export const Viewport: React.FC<ViewportProps> = ({
  activeTab,
  stats,
  searchEngine,
  onNavigate,
  onReload,
}) => {
  if (activeTab.url === 'neutrino://newtab' || !activeTab.url) {
    return (
      <NewTabDashboard
        onNavigate={onNavigate}
        stats={stats}
        searchEngine={searchEngine}
      />
    );
  }

  return (
    <div className="browser-viewport">
      {/* Top progress loader */}
      {activeTab.isLoading && <div className="loading-bar-animated" />}

      {/* Embedded Web View Container */}
      <div className="webview-container">
        {/* We can use an iframe for preview or host the native Gecko render surface */}
        <iframe
          src={activeTab.url}
          className="web-frame"
          title={activeTab.title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />

        {/* Floating Safe Shield Toast */}
        <div className="viewport-shield-toast">
          <Shield size={14} className="toast-icon" />
          <span>Protected by Neutrino Engine</span>
          <span className="toast-dot">•</span>
          <span>{activeTab.blockedTrackersCount || 12} trackers blocked</span>
          <button className="toast-btn" onClick={onReload} title="Reload with clean cache">
            <RefreshCw size={12} />
          </button>
          <a
            href={activeTab.url}
            target="_blank"
            rel="noreferrer"
            className="toast-link"
            title="Open in new window"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
};

