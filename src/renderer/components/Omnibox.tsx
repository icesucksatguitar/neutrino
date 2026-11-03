import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  ShieldCheck,
  Zap,
  Bot,
  Palette,
  ChevronDown,
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
  onGoBack,
  onGoForward,
  onReload,
  onToggleShieldModal,
  onToggleMcpModal,
  onToggleThemeModal,
  onZenOptimize,
}) => {
  return (
    <header className="top-navbar">
      {/* Left: Tabs Access Chevron + Navigation Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {onToggleTabs && (
          <button
            className={`tabs-dropdown-btn ${isTabsOpen ? 'open' : ''}`}
            onClick={onToggleTabs}
            title={isTabsOpen ? 'Hide Tabs' : 'Show Tabs'}
          >
            <ChevronDown size={15} />
          </button>
        )}

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
      </div>

      {/* Center Spacer: "remove the bar with search google to enter url" */}
      <div className="top-navbar-spacer" />

      {/* Right: Quick Action Badges */}
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

        {/* Theme Studio & Customizer Button */}
        {onToggleThemeModal && (
          <button
            className="nav-icon-btn"
            onClick={onToggleThemeModal}
            title="Theme Studio"
          >
            <Palette size={16} />
          </button>
        )}
      </div>
    </header>
  );
};
