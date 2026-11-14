import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  ShieldCheck,
  Zap,
  Bot,
  Palette,
  ChevronDown,
  Lock,
  Search,
  Globe,
} from 'lucide-react';
import { TabState, ShieldStats, ResourceStats } from '../types';

interface OmniboxProps {
  activeTab?: TabState;
  shieldStats: ShieldStats;
  resourceStats: ResourceStats;
  isTabsOpen?: boolean;
  onToggleTabs?: () => void;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onToggleShieldModal: () => void;
  onToggleMcpModal: () => void;
  onToggleThemeModal?: () => void;
  onZenOptimize: () => void;
}

export const Omnibox: React.FC<OmniboxProps> = ({
  activeTab,
  shieldStats,
  resourceStats,
  isTabsOpen,
  onToggleTabs,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onToggleShieldModal,
  onToggleMcpModal,
  onToggleThemeModal,
  onZenOptimize,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const rawUrl = activeTab?.url || '';
  const isNewTab = !rawUrl || rawUrl === 'neutrino://newtab' || rawUrl === 'about:blank';

  // Synchronize input value with active tab URL when not editing
  useEffect(() => {
    if (!isEditing) {
      setInputVal(isNewTab ? '' : rawUrl);
    }
  }, [rawUrl, isNewTab, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    let target = trimmed;
    if (target.startsWith('localhost') || target.startsWith('127.0.0.1')) {
      target = 'http://' + target;
    } else if (!target.includes('://')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = 'https://' + target;
      } else {
        target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      }
    }

    setIsEditing(false);
    onNavigate(target);
  };

  const handleFocus = () => {
    setIsEditing(true);
    setInputVal(isNewTab ? '' : rawUrl);
    setTimeout(() => {
      inputRef.current?.select();
    }, 10);
  };

  const handleBlur = () => {
    setIsEditing(false);
    setInputVal(isNewTab ? '' : rawUrl);
  };

  // Extract display domain for clean presentation
  const getDisplayDomain = () => {
    if (isNewTab) return '';
    try {
      const u = new URL(rawUrl);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return rawUrl;
    }
  };

  const isSecure = rawUrl.startsWith('https://');

  return (
    <header className="top-navbar">
      {/* Left: Minimal Tabs Dropdown & Navigation Controls */}
      <div className="nav-left-group">
        {onToggleTabs && (
          <button
            className={`tabs-minimal-toggle-btn ${isTabsOpen ? 'open' : ''}`}
            onClick={onToggleTabs}
            title={isTabsOpen ? 'Hide Tabs' : 'Show Tabs'}
            aria-label="Toggle Tabs"
          >
            <ChevronDown size={14} />
          </button>
        )}

        <div className="nav-history-buttons">
          <button
            className="chrome-nav-btn"
            disabled={!activeTab?.canGoBack}
            onClick={onGoBack}
            title="Back (Alt+Left)"
            aria-label="Back"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            className="chrome-nav-btn"
            disabled={!activeTab?.canGoForward}
            onClick={onGoForward}
            title="Forward (Alt+Right)"
            aria-label="Forward"
          >
            <ArrowRight size={14} />
          </button>
          <button
            className="chrome-nav-btn"
            onClick={onReload}
            title="Reload (Ctrl+R)"
            aria-label="Reload"
          >
            <RotateCw size={13} className={activeTab?.isLoading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Center: Address Bar (Visual Centerpiece, Priority 2) */}
      <div className="nav-center-container">
        <form className="centerpiece-address-bar" onSubmit={handleSubmit}>
          {/* Security / Search Icon */}
          <div className="address-bar-prefix">
            {isNewTab ? (
              <Search size={13} className="address-bar-icon-faint" />
            ) : isSecure ? (
              <Lock size={12} className="address-bar-icon-secure" title="Connection is secure (HTTPS)" />
            ) : (
              <Globe size={13} className="address-bar-icon-faint" />
            )}
          </div>

          {/* Real Editable Address Input */}
          <input
            ref={inputRef}
            type="text"
            className="address-bar-input"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="Search Google or enter address..."
            spellCheck={false}
            autoComplete="off"
          />

          {/* Clean Display Label when idle and not new tab */}
          {!isEditing && !isNewTab && (
            <div className="address-bar-display-pill" onClick={handleFocus}>
              <span className="address-bar-host">{getDisplayDomain()}</span>
              {activeTab?.isLoading && <span className="address-bar-loading-indicator" />}
            </div>
          )}
        </form>
      </div>

      {/* Right: Refined Utility Controls */}
      <div className="nav-right-group">
        {/* Brave-Level Shields Counter */}
        <button
          className="chrome-pill-badge shield-badge"
          onClick={onToggleShieldModal}
          title="Brave-level Protections: Ads & Trackers Blocked"
          aria-label="Shields"
        >
          <ShieldCheck size={13} />
          <span>{shieldStats.totalBlocked}</span>
        </button>

        {/* Zen Resource Saver */}
        <button
          className="chrome-pill-badge zen-badge"
          onClick={onZenOptimize}
          title="Zen-level Low Resource: Hibernate background tabs"
          aria-label="Zen Mode"
        >
          <Zap size={12} />
          <span>{resourceStats.memorySavedMb > 0 ? `${resourceStats.memorySavedMb}MB` : 'Zen'}</span>
        </button>

        {/* MCP Protocol Inspector */}
        <button
          className="chrome-nav-btn"
          onClick={onToggleMcpModal}
          title="MCP Drawer (Assistants, Local Models, Tools)"
          aria-label="MCP Inspector"
        >
          <Bot size={15} />
        </button>

        {/* Theme Studio */}
        {onToggleThemeModal && (
          <button
            className="chrome-nav-btn"
            onClick={onToggleThemeModal}
            title="Themes System"
            aria-label="Themes"
          >
            <Palette size={15} />
          </button>
        )}
      </div>
    </header>
  );
};
