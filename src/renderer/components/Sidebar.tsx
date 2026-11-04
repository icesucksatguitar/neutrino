import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  ChevronDown,
  ChevronUp,
  Layers,
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

// Domain metadata extractor for macOS notification presentation
function getTabDomainInfo(url: string, title?: string) {
  if (!url || url === 'neutrino://newtab' || url === 'about:blank') {
    return {
      domain: 'neutrino',
      displayName: 'Neutrino',
      color: '#7c9cff',
      isInternal: true,
    };
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const parts = host.split('.');

    if (host.includes('youtube.com')) {
      return { domain: 'youtube.com', displayName: 'YouTube', color: '#ef4444', isInternal: false };
    }
    if (host.includes('google.com')) {
      return { domain: 'google.com', displayName: 'Google', color: '#3b82f6', isInternal: false };
    }
    if (host.includes('github.com')) {
      return { domain: 'github.com', displayName: 'GitHub', color: '#6366f1', isInternal: false };
    }
    if (host.includes('reddit.com')) {
      return { domain: 'reddit.com', displayName: 'Reddit', color: '#f97316', isInternal: false };
    }
    if (host.includes('wikipedia.org')) {
      return { domain: 'wikipedia.org', displayName: 'Wikipedia', color: '#e2e8f0', isInternal: false };
    }
    if (host.includes('chatgpt.com') || host.includes('openai.com')) {
      return { domain: host, displayName: 'ChatGPT', color: '#10b981', isInternal: false };
    }
    if (host.includes('twitter.com') || host.includes('x.com')) {
      return { domain: host, displayName: 'X', color: '#94a3b8', isInternal: false };
    }

    const brandName = parts.length >= 2 ? parts[parts.length - 2] : host;
    const displayName = brandName.charAt(0).toUpperCase() + brandName.slice(1);
    return {
      domain: host,
      displayName,
      color: '#8b5cf6',
      isInternal: false,
    };
  } catch {
    return {
      domain: 'web',
      displayName: title || 'Web Page',
      color: '#64748b',
      isInternal: false,
    };
  }
}

interface TabGroup {
  key: string;
  domain: string;
  displayName: string;
  color: string;
  tabs: TabState[];
  hasActiveTab: boolean;
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

  // Tabs Dropdown open/close state triggered by the arrow on top
  const [isTabsDropdownOpen, setIsTabsDropdownOpen] = useState(true);

  // Expanded status for stacked tab groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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

  // Group similar regular tabs together by domain
  const tabGroups = useMemo(() => {
    const groups: TabGroup[] = [];
    const map = new Map<string, TabGroup>();

    for (const tab of regularTabs) {
      const info = getTabDomainInfo(tab.url, tab.title);
      const key = info.domain;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          domain: info.domain,
          displayName: info.displayName,
          color: info.color,
          tabs: [],
          hasActiveTab: false,
        };
        map.set(key, g);
        groups.push(g);
      }
      g.tabs.push(tab);
      if (tab.id === activeTabId) {
        g.hasActiveTab = true;
      }
    }
    return groups;
  }, [regularTabs, activeTabId]);

  // Spaces Slider calculations
  const activeSpaceIndex = Math.max(
    0,
    spaces.findIndex((s) => s.id === activeSpaceId)
  );
  const activeSpace = spaces[activeSpaceIndex] || spaces[0];

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

  // Render a single macOS notification tab card (Image 3 reference)
  const renderTabCard = (tab: TabState, inStack: boolean = false) => {
    const isActive = tab.id === activeTabId;
    const info = getTabDomainInfo(tab.url, tab.title);

    return (
      <div
        key={tab.id}
        draggable
        onDragStart={(e) => handleDragStart(e, tab.id)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, tab.id)}
        className={`arc-macos-tab-card ${isActive ? 'active' : ''} ${inStack ? 'stacked-card' : ''}`}
        onClick={() => onSelectTab(tab.id)}
      >
        {/* Active glowing indicator */}
        {isActive && <div className="arc-macos-tab-active-glow" />}

        {/* macOS Notification Left App Squircle */}
        <div
          className="arc-macos-tab-squircle"
          style={{ backgroundColor: info.color ? `${info.color}22` : 'rgba(255, 255, 255, 0.08)' }}
        >
          {tab.favicon ? (
            <img src={tab.favicon} alt="" className="arc-macos-tab-favicon" />
          ) : (
            <Globe size={16} style={{ color: info.color || '#7c9cff' }} />
          )}
        </div>

        {/* macOS Notification Content Body */}
        <div className="arc-macos-tab-body">
          {/* Header row: App/Domain Name + Status/Time + Close */}
          <div className="arc-macos-tab-header-row">
            <span className="arc-macos-tab-app-name">{info.displayName}</span>
            <div className="arc-macos-tab-right-meta">
              {tab.hasActiveMedia && (
                <Volume2 size={12} className="arc-meta-icon media" title="Playing Audio" />
              )}
              {tab.isSleeping && (
                <Moon size={11} className="arc-meta-icon sleep" title="Sleeping" />
              )}
              <span className="arc-macos-tab-timestamp">
                {isActive ? 'Active' : 'now'}
              </span>
              <button
                className="arc-macos-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                title="Close Tab"
                aria-label="Close Tab"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Subtitle row: Page Title */}
          <div className="arc-macos-tab-title-row" title={tab.title || 'New Tab'}>
            {tab.title || 'New Tab'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className={`arc-sidebar ${isOpen ? 'expanded' : 'collapsed'}`}>
      {/* 1. Arc Sidebar Top Header with Arrow on Top to Trigger Tabs Dropdown */}
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

        <div className="arc-header-right">
          {/* Arrow on top that triggers dropdown for tabs */}
          <button
            className={`arc-icon-btn arc-tabs-dropdown-trigger ${isTabsDropdownOpen ? 'open' : 'closed'}`}
            onClick={() => setIsTabsDropdownOpen(!isTabsDropdownOpen)}
            title={isTabsDropdownOpen ? 'Collapse Tabs Dropdown' : 'Expand Tabs Dropdown'}
            aria-label="Trigger Tabs Dropdown"
          >
            <ChevronDown size={14} className="arc-dropdown-chevron" />
          </button>

          {/* Sidebar Hide Toggle */}
          <button
            className="arc-icon-btn arc-toggle-btn"
            onClick={onToggleSidebar}
            title="Toggle Sidebar (Ctrl+S)"
            aria-label="Toggle Sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
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

      {/* 3. Arc Pinned Favorites (if any) */}
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

      {/* 4. Tabs Section - Sits on Transparent Background, Dropdown Triggered by Top Arrow */}
      <div className={`arc-tabs-section ${isTabsDropdownOpen ? 'open' : 'collapsed'}`}>
        <div className="arc-tabs-header-strip">
          <button
            className="arc-tabs-title-trigger-btn"
            onClick={() => setIsTabsDropdownOpen(!isTabsDropdownOpen)}
            title="Toggle Tabs Dropdown"
          >
            <ChevronDown
              size={13}
              className={`arc-tabs-strip-arrow ${isTabsDropdownOpen ? 'open' : 'closed'}`}
            />
            <span className="arc-section-title">Tabs</span>
            <span className="arc-tabs-count-badge">{regularTabs.length}</span>
          </button>

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

        {/* Scrollable Tabs List - Transparent Background, macOS Notification Cards & Grouped Stacks */}
        {isTabsDropdownOpen && (
          <div className="arc-tabs-scroll-list transparent-bg">
            {tabGroups.map((group) => {
              const isGroupExpanded = expandedGroups[group.key];

              // Case A: Single tab in this domain -> clean single notification card
              if (group.tabs.length === 1) {
                return renderTabCard(group.tabs[0]);
              }

              // Case B: Multiple tabs from same domain -> Grouped Stack (Image 3 reference)
              const topTab =
                group.tabs.find((t) => t.id === activeTabId) || group.tabs[0];

              if (!isGroupExpanded) {
                // Stacked View: Top notification card + stacked peek layers underneath
                return (
                  <div key={group.key} className="arc-tab-stack-container">
                    {/* Top Active/Primary Card */}
                    {renderTabCard(topTab, true)}

                    {/* Stacked card layers peeking out from underneath */}
                    <div className="arc-stack-peek-layer arc-peek-1" />
                    <div className="arc-stack-peek-layer arc-peek-2" />

                    {/* Stack Count Pill (Image 3: "7 more notifications" style) */}
                    <button
                      className="arc-stack-toggle-pill"
                      onClick={() => toggleGroup(group.key)}
                      title={`Expand ${group.tabs.length} tabs from ${group.displayName}`}
                    >
                      <Layers size={11} />
                      <span>{group.tabs.length} tabs from {group.displayName}</span>
                      <ChevronDown size={11} />
                    </button>
                  </div>
                );
              }

              // Expanded Group View: All tabs in group revealed with collapse button
              return (
                <div key={group.key} className="arc-tab-stack-container expanded">
                  <div className="arc-group-expanded-header">
                    <span className="arc-group-expanded-title">
                      <Layers size={12} style={{ color: group.color }} />
                      <span>{group.displayName}</span>
                      <span className="arc-group-badge">{group.tabs.length}</span>
                    </span>
                    <button
                      className="arc-group-collapse-btn"
                      onClick={() => toggleGroup(group.key)}
                      title="Stack Tabs"
                    >
                      <span>Stack</span>
                      <ChevronUp size={11} />
                    </button>
                  </div>

                  <div className="arc-group-cards-list">
                    {group.tabs.map((tab) => renderTabCard(tab))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Spaces Slider & Utilities (Bottom Section - Text Removed, Slider Added, Image 1) */}
      <div className="arc-sidebar-bottom">
        {/* Spaces Slider Container (No text - Image 1 reference) */}
        <div className="arc-spaces-bar">
          <div className="arc-spaces-slider-wrapper">
            <div className="arc-spaces-slider-track">
              {/* Dynamic Tick Marks for each Space */}
              {spaces.map((s, idx) => {
                const isSelected = s.id === activeSpaceId;
                return (
                  <button
                    key={s.id}
                    className={`arc-slider-tick ${isSelected ? 'active' : ''}`}
                    onClick={() => onSelectSpace(s.id)}
                    title={`Switch to Space: ${s.name}`}
                    aria-label={`Space ${s.name}`}
                  >
                    <span
                      className="arc-slider-tick-dot"
                      style={{ backgroundColor: s.color || '#7c9cff' }}
                    />
                  </button>
                );
              })}

              {/* Sliding Pill Thumb */}
              <div
                className="arc-slider-thumb"
                style={{
                  width: `${Math.max(22, 100 / Math.max(1, spaces.length))}%`,
                  transform: `translateX(${activeSpaceIndex * 100}%)`,
                }}
              >
                <span
                  className="arc-thumb-glow-dot"
                  style={{ backgroundColor: activeSpace?.color || '#7c9cff' }}
                />
              </div>

              {/* Range Input Overlay for Dragging */}
              <input
                type="range"
                min={0}
                max={Math.max(0, spaces.length - 1)}
                step={1}
                value={activeSpaceIndex}
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  if (spaces[idx]) onSelectSpace(spaces[idx].id);
                }}
                className="arc-spaces-range-input"
                aria-label="Spaces Slider"
              />
            </div>

            {/* Minimal Add Space Button */}
            <button
              className="arc-add-space-btn"
              onClick={() => setIsCreatingSpace(!isCreatingSpace)}
              title="Create New Space"
              aria-label="Add Space"
            >
              <Plus size={13} />
            </button>
          </div>
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
              <Moon size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
