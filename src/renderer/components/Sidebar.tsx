import React from 'react';
import {
  Plus,
  X,
  Moon,
  Pin,
  Globe,
  Volume2,
} from 'lucide-react';
import { TabState } from '../types';

interface SidebarProps {
  spaces: any[];
  activeSpaceId: string;
  tabs: TabState[];
  activeTabId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCommandBar: () => void;
  onOpenThemeStudio?: () => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTogglePinTab: (id: string) => void;
  onToggleSleepTab: (id: string) => void;
  onSelectSpace: (id: string) => void;
  onCreateTab: (url?: string, spaceId?: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSpaceId,
  tabs,
  activeTabId,
  isOpen,
  onClose,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onToggleSleepTab,
  onCreateTab,
}) => {
  if (!isOpen && tabs.length === 0) return null;

  const unpinnedTabs = tabs.filter((t) => !t.isPinned);
  const pinnedTabs = tabs.filter((t) => t.isPinned);

  return (
    <>
      {/* Invisible / Subtle click-to-dismiss overlay when open */}
      {isOpen && <div className="tabs-drawer-backdrop" onClick={onClose} />}

      {/* 6. Floating Tabs Sidebar: Broader (280px), Light Theme, High Contrast */}
      <aside className={`floating-tabs-panel ${isOpen ? 'open' : ''}`}>
        {/* Floating Actions Strip */}
        <div className="tabs-floating-actions">
          <button
            className="floating-new-tab-btn"
            onClick={() => onCreateTab(undefined, activeSpaceId)}
            title="New Tab (Ctrl+T)"
          >
            <Plus size={15} />
            <span>New Tab</span>
          </button>
        </div>

        {/* Pinned Tabs (if any) */}
        {pinnedTabs.length > 0 && (
          <div className="pinned-tabs-row">
            {pinnedTabs.map((tab) => {
              const isSelected = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  className={`pinned-tab-chip ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectTab(tab.id)}
                  title={tab.title}
                >
                  {tab.favicon ? (
                    <img src={tab.favicon} alt="" className="tab-favicon-sm" />
                  ) : (
                    <Globe size={12} />
                  )}
                  <span className="tab-chip-title">{tab.title || 'Tab'}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Open Tabs Pills */}
        <div className="tabs-scroll-container">
          {unpinnedTabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={`floating-tab-row ${isActive ? 'active' : ''}`}
                style={{ animationDelay: `${idx * 20}ms` }}
                onClick={() => onSelectTab(tab.id)}
              >
                <div className="tab-icon-wrapper">
                  {tab.favicon ? (
                    <img src={tab.favicon} alt="" className="tab-favicon-sm" />
                  ) : (
                    <span className="tab-dot-icon" />
                  )}
                </div>

                {/* Truncated readable title (Section 6) */}
                <span className="floating-tab-title" title={tab.title}>
                  {tab.title || 'New Tab'}
                </span>

                {tab.hasActiveMedia && (
                  <span className="tab-status-media" title="Playing Media (Zen exempt)">
                    <Volume2 size={12} />
                  </span>
                )}

                {tab.isSleeping && (
                  <span className="tab-status-sleep" title="Sleeping (RAM saved)">
                    <Moon size={11} />
                  </span>
                )}

                <div className="tab-actions-group">
                  <button
                    className="tab-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePinTab(tab.id);
                    }}
                    title="Pin Tab"
                  >
                    <Pin size={11} />
                  </button>
                  <button
                    className="tab-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSleepTab(tab.id);
                    }}
                    title={tab.isSleeping ? 'Wake' : 'Sleep'}
                  >
                    <Moon size={11} />
                  </button>
                  <button
                    className="tab-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    title="Close Tab"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
};
