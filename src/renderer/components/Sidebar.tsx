import React from 'react';
import {
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Plus,
  X,
  Moon,
  Pin,
  Globe,
  Home,
  Briefcase,
  Terminal,
  Compass,
} from 'lucide-react';
import { Space, TabState } from '../types';

interface SidebarProps {
  spaces: Space[];
  activeSpaceId: string;
  tabs: TabState[];
  activeTabId: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenCommandBar: () => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTogglePinTab: (id: string) => void;
  onToggleSleepTab: (id: string) => void;
  onSelectSpace: (id: string) => void;
  onCreateTab: (url?: string, spaceId?: string) => void;
}

const PINNED_FAVORITES = [
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', icon: '🦆' },
  { name: 'GitHub', url: 'https://github.com', icon: '🐙' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com', icon: '🟧' },
  { name: 'Wikipedia', url: 'https://wikipedia.org', icon: '📖' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  spaces,
  activeSpaceId,
  tabs,
  activeTabId,
  isCollapsed,
  onToggleCollapse,
  onOpenCommandBar,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onToggleSleepTab,
  onSelectSpace,
  onCreateTab,
}) => {
  const currentSpace = spaces.find((s) => s.id === activeSpaceId) || spaces[0];
  const unpinnedTabs = tabs.filter((t) => !t.isPinned);
  const pinnedTabs = tabs.filter((t) => t.isPinned);

  const getSpaceIcon = (iconName: string) => {
    switch (iconName) {
      case 'Briefcase': return <Briefcase size={14} />;
      case 'Terminal': return <Terminal size={14} />;
      case 'Compass': return <Compass size={14} />;
      default: return <Home size={14} />;
    }
  };

  return (
    <aside className={`arc-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Top Header */}
      <div className="sidebar-header">
        {!isCollapsed && (
          <div className="brand-badge">
            <Shield size={18} className="logo-icon" />
            <span>Neutrino</span>
          </div>
        )}
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand Sidebar (Ctrl+S)' : 'Collapse Sidebar (Ctrl+S)'}
        >
          {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Arc Command Palette Trigger Button */}
      <button
        className="command-trigger-btn"
        onClick={onOpenCommandBar}
        title="Open Command Palette (Ctrl+T or Ctrl+K)"
      >
        <Search size={14} />
        {!isCollapsed && <span>Search or type URL...</span>}
        {!isCollapsed && <span className="shortcut-kbd">Ctrl+T</span>}
      </button>

      {/* Pinned Quick Apps (Arc Style) */}
      <div className="pinned-section">
        {!isCollapsed && <div className="section-label">Favorites</div>}
        <div className="pinned-grid">
          {PINNED_FAVORITES.map((fav) => (
            <div
              key={fav.name}
              className="pinned-tile"
              onClick={() => onCreateTab(fav.url, activeSpaceId)}
              title={fav.name}
            >
              <span>{fav.icon}</span>
            </div>
          ))}
          {pinnedTabs.map((tab) => (
            <div
              key={tab.id}
              className={`pinned-tile ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              title={tab.title}
            >
              {tab.favicon ? (
                <img src={tab.favicon} alt="" className="tab-favicon" />
              ) : (
                <Globe size={14} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs List for Active Space */}
      <div className="tabs-scroll-area">
        {!isCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 6px 4px' }}>
            <span className="section-label" style={{ marginBottom: 0 }}>
              {currentSpace?.name || 'Tabs'}
            </span>
            <button
              className="sidebar-toggle-btn"
              onClick={() => onCreateTab(undefined, activeSpaceId)}
              title="New Tab"
            >
              <Plus size={14} />
            </button>
          </div>
        )}

        {unpinnedTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`tab-item-row ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              {tab.favicon ? (
                <img src={tab.favicon} alt="" className="tab-favicon" />
              ) : (
                <Globe size={14} className="tab-favicon" />
              )}

              {!isCollapsed && (
                <>
                  <span className="tab-title" title={tab.title}>
                    {tab.title || 'New Tab'}
                  </span>

                  {tab.isSleeping && (
                    <span className="tab-sleeping-badge" title="Sleeping (RAM saved)">
                      <Moon size={11} />
                    </span>
                  )}

                  <span
                    className="tab-action-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePinTab(tab.id);
                    }}
                    title="Pin Tab"
                  >
                    <Pin size={12} />
                  </span>

                  <span
                    className="tab-action-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSleepTab(tab.id);
                    }}
                    title={tab.isSleeping ? 'Wake Tab' : 'Sleep Tab'}
                  >
                    <Moon size={12} />
                  </span>

                  <span
                    className="tab-action-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    title="Close Tab"
                  >
                    <X size={12} />
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Spaces Switcher Bar (Arc Style) */}
      <div className="spaces-bar">
        {spaces.map((space) => {
          const isActive = space.id === activeSpaceId;
          return (
            <button
              key={space.id}
              className={`space-pill ${isActive ? 'active' : ''}`}
              onClick={() => onSelectSpace(space.id)}
              title={space.name}
            >
              <span className="space-dot" style={{ backgroundColor: space.color }} />
              {!isCollapsed && <span>{space.name}</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
};
