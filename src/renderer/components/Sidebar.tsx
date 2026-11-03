import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  Pin,
  Moon,
  Volume2,
  Lock,
  Search,
  Globe,
  PanelLeftClose,
  Bot,
  Palette,
  ShieldCheck,
  Zap,
  FolderPlus,
} from 'lucide-react';
import { Space, TabState, ShieldStats, ResourceStats } from '../types';

interface SidebarProps {
  spaces: Space[];
  activeSpaceId: string;
  tabs: TabState[];
  activeTabId: string | null;
  isOpen: boolean;
  onToggleSidebar: () => void;
  onOpenCommandBar: () => void;
  onOpenThemeStudio?: () => void;
  onToggleShieldModal?: () => void;
  onToggleMcpModal?: () => void;
  onZenOptimize?: () => void;
  shieldStats?: ShieldStats;
  resourceStats?: ResourceStats;
  activeTab?: TabState;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTogglePinTab: (id: string) => void;
  onToggleSleepTab: (id: string) => void;
  onSelectSpace: (id: string) => void;
  onCreateTab: (url?: string, spaceId?: string) => void;
  onCreateSpace?: (name: string, color: string) => void;
  onDeleteSpace?: (spaceId: string) => void;
  onReorderTabs?: (draggedTabId: string, targetTabId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  spaces,
  activeSpaceId,
  tabs,
  activeTabId,
  isOpen,
  onToggleSidebar,
  onOpenCommandBar,
  onOpenThemeStudio,
  onToggleShieldModal,
  onToggleMcpModal,
  onZenOptimize,
  shieldStats = { totalBlocked: 0, adsBlocked: 0, trackersBlocked: 0, analyticsBlocked: 0, fingerprintersBlocked: 0, dataSavedKb: 0 },
  resourceStats = { memorySavedMb: 0, sleepingCount: 0 },
  activeTab,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onToggleSleepTab,
  onSelectSpace,
  onCreateTab,
  onCreateSpace,
  onDeleteSpace,
  onReorderTabs,
}) => {
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  const rawUrl = activeTab?.url || '';
  const isNewTab = !rawUrl || rawUrl === 'neutrino://newtab' || rawUrl === 'about:blank';

  // Synchronize address input
  useEffect(() => {
    if (!isEditingUrl) {
      setUrlInput(isNewTab ? '' : rawUrl);
    }
  }, [rawUrl, isNewTab, isEditingUrl]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
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

    setIsEditingUrl(false);
    onNavigate(target);
  };

  const handleUrlFocus = () => {
    setIsEditingUrl(true);
    setUrlInput(isNewTab ? '' : rawUrl);
    setTimeout(() => urlInputRef.current?.select(), 10);
  };

  const handleUrlBlur = () => {
    setIsEditingUrl(false);
    setUrlInput(isNewTab ? '' : rawUrl);
  };

  // Get clean display domain
  const getDisplayDomain = () => {
    if (isNewTab) return 'Search or enter URL...';
    try {
      const u = new URL(rawUrl);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return activeTab?.title || rawUrl;
    }
  };

  const isSecure = rawUrl.startsWith('https://');

  // Filter tabs into Pinned vs Regular
  const pinnedTabs = tabs.filter((t) => t.isPinned);
  const regularTabs = tabs.filter((t) => !t.isPinned);

  // Active Space
  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || spaces[0];

  // Drag and drop reordering
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('text/plain', tabId);
    setDraggedTabId(tabId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (draggedTabId && draggedTabId !== targetTabId && onReorderTabs) {
      onReorderTabs(draggedTabId, targetTabId);
    }
    setDraggedTabId(null);
  };

  const handleCreateSpaceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSpaceName.trim();
    if (name && onCreateSpace) {
      const colors = ['#7c9cff', '#38bdf8', '#4ade80', '#a78bfa', '#fb7185', '#fbbf24'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      onCreateSpace(name, randomColor);
      setNewSpaceName('');
      setIsCreatingSpace(false);
    }
  };

  return (
    <aside className={`arc-sidebar ${isOpen ? 'expanded' : 'collapsed'}`}>
      {/* 1. Arc Sidebar Top Header: Window Controls, Navigation, Sidebar Toggle */}
      <div className="arc-sidebar-header">
        <div className="arc-header-left">
          <div className="arc-traffic-dot" title="Neutrino Browser" />
          <div className="arc-history-buttons">
            <button
              className="arc-icon-btn"
              disabled={!activeTab?.canGoBack}
              onClick={onGoBack}
              title="Back (Alt+Left)"
              aria-label="Back"
            >
              <ArrowLeft size={13} />
            </button>
            <button
              className="arc-icon-btn"
              disabled={!activeTab?.canGoForward}
              onClick={onGoForward}
              title="Forward (Alt+Right)"
              aria-label="Forward"
            >
              <ArrowRight size={13} />
            </button>
            <button
              className="arc-icon-btn"
              onClick={onReload}
              title="Reload (Ctrl+R)"
              aria-label="Reload"
            >
              <RotateCw size={12} className={activeTab?.isLoading ? 'spinning' : ''} />
            </button>
          </div>
        </div>

        <button
          className="arc-icon-btn arc-toggle-btn"
          onClick={onToggleSidebar}
          title="Toggle Sidebar (Ctrl+S)"
          aria-label="Toggle Sidebar"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* 2. Arc Integrated Address / Omnibox Bar */}
      <div className="arc-omnibox-container">
        <form className="arc-omnibox-form" onSubmit={handleUrlSubmit}>
          <div className="arc-omnibox-icon-wrapper">
            {isNewTab ? (
              <Search size={13} className="arc-omnibox-icon" />
            ) : isSecure ? (
              <Lock size={12} className="arc-omnibox-icon-secure" title="Secure connection" />
            ) : (
              <Globe size={13} className="arc-omnibox-icon" />
            )}
          </div>

          <input
            ref={urlInputRef}
            type="text"
            className="arc-omnibox-input"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onFocus={handleUrlFocus}
            onBlur={handleUrlBlur}
            placeholder="Search or enter URL..."
            spellCheck={false}
            autoComplete="off"
          />

          {!isEditingUrl && (
            <div className="arc-omnibox-display-pill" onClick={handleUrlFocus}>
              <span className="arc-display-domain">{getDisplayDomain()}</span>
              {activeTab?.isLoading && <span className="arc-display-loader" />}
            </div>
          )}
        </form>
      </div>

      {/* 3. Arc Pinned Favorites / Apps Grid (Top Section) */}
      {pinnedTabs.length > 0 && (
        <div className="arc-pinned-section">
          <div className="arc-pinned-grid">
            {pinnedTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  className={`arc-pinned-tile ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectTab(tab.id)}
                  title={tab.title}
                >
                  <div className="arc-tile-favicon-wrapper">
                    {tab.favicon ? (
                      <img src={tab.favicon} alt="" className="arc-tile-favicon" />
                    ) : (
                      <Globe size={14} />
                    )}
                  </div>
                  <span className="arc-tile-title">{tab.title || 'Tab'}</span>
                  <button
                    className="arc-tile-unpin-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePinTab(tab.id);
                    }}
                    title="Unpin Tab"
                  >
                    <Pin size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Arc Tabs Section (Vertical tabs for current Space) */}
      <div className="arc-tabs-section">
        <div className="arc-tabs-header-strip">
          <span className="arc-section-title">Tabs</span>
          <button
            className="arc-new-tab-btn"
            onClick={() => onCreateTab(undefined, activeSpaceId)}
            title="New Tab (Ctrl+T)"
            aria-label="New Tab"
          >
            <Plus size={13} />
            <span>New Tab</span>
          </button>
        </div>

        <div className="arc-tabs-scroll-list">
          {regularTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                draggable
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, tab.id)}
                className={`arc-tab-pill ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTab(tab.id)}
              >
                {/* Active Indicator bar */}
                {isActive && <div className="arc-tab-active-indicator" />}

                {/* Favicon or fallback */}
                <div className="arc-tab-favicon-wrapper">
                  {tab.favicon ? (
                    <img src={tab.favicon} alt="" className="arc-tab-favicon" />
                  ) : (
                    <div className="arc-tab-dot" />
                  )}
                </div>

                {/* Page Title */}
                <span className="arc-tab-title" title={tab.title}>
                  {tab.title || 'New Tab'}
                </span>

                {/* Status Badges: Audio playing / Zen Sleeping */}
                {tab.hasActiveMedia && (
                  <span className="arc-status-media" title="Playing audio/video">
                    <Volume2 size={12} />
                  </span>
                )}
                {tab.isSleeping && (
                  <span className="arc-status-sleep" title="Sleeping (RAM saved)">
                    <Moon size={11} />
                  </span>
                )}

                {/* Tab Hover Actions (Pin, Close) */}
                <div className="arc-tab-actions">
                  <button
                    className="arc-tab-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePinTab(tab.id);
                    }}
                    title="Pin Tab"
                  >
                    <Pin size={11} />
                  </button>
                  <button
                    className="arc-tab-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    title="Close Tab (Ctrl+W)"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Arc Spaces Bar & Utilities (Bottom Section) */}
      <div className="arc-sidebar-bottom">
        {/* Spaces Switcher Segmented Bar */}
        <div className="arc-spaces-bar">
          <div className="arc-spaces-list">
            {spaces.map((space) => {
              const isSelected = space.id === activeSpaceId;
              return (
                <button
                  key={space.id}
                  className={`arc-space-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectSpace(space.id)}
                  title={`Switch to ${space.name}`}
                  style={{
                    '--space-color': space.color || '#7c9cff',
                  } as React.CSSProperties}
                >
                  <span
                    className="arc-space-dot"
                    style={{ backgroundColor: space.color || '#7c9cff' }}
                  />
                  <span className="arc-space-name">{space.name}</span>
                  {spaces.length > 1 && onDeleteSpace && (
                    <span
                      className="arc-space-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSpace(space.id);
                      }}
                      title={`Delete ${space.name}`}
                    >
                      <X size={10} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Add Space Button */}
          <button
            className="arc-add-space-btn"
            onClick={() => setIsCreatingSpace(!isCreatingSpace)}
            title="Create New Space"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Inline Create Space Form */}
        {isCreatingSpace && (
          <form className="arc-create-space-form" onSubmit={handleCreateSpaceSubmit}>
            <input
              type="text"
              className="arc-create-space-input"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              placeholder="Space name..."
              autoFocus
            />
            <button type="submit" className="arc-create-space-submit">
              Add
            </button>
          </form>
        )}

        {/* Utilities Footer Bar: Shields, Zen, MCP, Theme */}
        <div className="arc-utility-strip">
          <button
            className="arc-util-pill shield"
            onClick={onToggleShieldModal}
            title="Brave-level Shields: View Blocked Trackers"
          >
            <ShieldCheck size={13} />
            <span>{shieldStats.totalBlocked}</span>
          </button>

          <button
            className="arc-util-pill zen"
            onClick={onZenOptimize}
            title="Zen Mode: Save RAM by hibernating tabs"
          >
            <Zap size={12} />
            <span>{resourceStats.memorySavedMb > 0 ? `${resourceStats.memorySavedMb}MB` : 'Zen'}</span>
          </button>

          <div className="arc-util-spacer" />

          {onToggleMcpModal && (
            <button
              className="arc-icon-btn"
              onClick={onToggleMcpModal}
              title="MCP Drawer (Assistants, Local Models, Tools)"
            >
              <Bot size={14} />
            </button>
          )}

          {onOpenThemeStudio && (
            <button
              className="arc-icon-btn"
              onClick={onOpenThemeStudio}
              title="Themes & Appearance"
            >
              <Palette size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
