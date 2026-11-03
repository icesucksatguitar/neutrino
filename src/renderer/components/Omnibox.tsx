import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Lock,
  Search,
  ShieldCheck,
  Zap,
  Bot,
} from 'lucide-react';
import { TabState, ShieldStats, ResourceStats } from '../types';

interface OmniboxProps {
  activeTab?: TabState;
  shieldStats: ShieldStats;
  resourceStats: ResourceStats;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onToggleShieldModal: () => void;
  onToggleMcpModal: () => void;
  onZenOptimize: () => void;
}

export const Omnibox: React.FC<OmniboxProps> = ({
  activeTab,
  shieldStats,
  resourceStats,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onToggleShieldModal,
  onToggleMcpModal,
  onZenOptimize,
}) => {
  const [inputVal, setInputVal] = useState(activeTab?.url || '');

  useEffect(() => {
    if (activeTab?.url) {
      setInputVal(activeTab.url);
    }
  }, [activeTab?.url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputVal.trim();
    if (!query) return;

    let target = query;
    if (target.startsWith('localhost') || target.startsWith('127.0.0.1')) {
      target = 'http://' + target;
    } else if (!target.includes('://')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = 'https://' + target;
      } else {
        // Fallback to private search query
        target = `https://duckduckgo.com/?q=${encodeURIComponent(target)}`;
      }
    }

    onNavigate(target);
  };

  const isSecure = inputVal.startsWith('https://');

  return (
    <header className="top-navbar">
      {/* Navigation Buttons */}
      <div className="nav-buttons-group">
        <button
          className="nav-icon-btn"
          disabled={!activeTab?.canGoBack}
          onClick={onGoBack}
          title="Back (Alt+Left)"
        >
          <ArrowLeft size={15} />
        </button>
        <button
          className="nav-icon-btn"
          disabled={!activeTab?.canGoForward}
          onClick={onGoForward}
          title="Forward (Alt+Right)"
        >
          <ArrowRight size={15} />
        </button>
        <button
          className="nav-icon-btn"
          onClick={onReload}
          title="Reload (Ctrl+R)"
        >
          <RotateCw size={14} className={activeTab?.isLoading ? 'spinning' : ''} />
        </button>
      </div>

      {/* Omnibox Address & Search Bar */}
      <div className="omnibox-container">
        <form className="omnibox-form" onSubmit={handleSubmit}>
          <span className="security-indicator" title={isSecure ? 'Encrypted Connection (TLS)' : 'Address'}>
            {isSecure ? <Lock size={13} /> : <Search size={13} style={{ color: 'var(--text-dim)' }} />}
          </span>

          <input
            type="text"
            className="omnibox-input"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Search DuckDuckGo or enter URL..."
            spellCheck={false}
          />
        </form>
      </div>

      {/* Quick Action Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Brave Shield Flyout Button */}
        <button
          className="shield-badge-btn"
          onClick={onToggleShieldModal}
          title="Brave-level Shields: View blocked ads and trackers"
        >
          <ShieldCheck size={14} />
          <span>{shieldStats.totalBlocked}</span>
        </button>

        {/* Zen Resource Saver Button */}
        <button
          className="zen-purge-btn"
          onClick={onZenOptimize}
          title="Zen-level Low Resource: Put inactive tabs to sleep and save RAM"
        >
          <Zap size={13} />
          <span>{resourceStats.memorySavedMb > 0 ? `${resourceStats.memorySavedMb}MB` : 'Zen'}</span>
        </button>

        {/* MCP Protocol Inspector Button */}
        <button
          className="nav-icon-btn"
          onClick={onToggleMcpModal}
          title="Model Context Protocol (MCP) Inspector"
        >
          <Bot size={16} />
        </button>
      </div>
    </header>
  );
};
