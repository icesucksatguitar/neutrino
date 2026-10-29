import React from 'react';
import { Plus, X, Volume2, VolumeX, Shield, Lock } from 'lucide-react';
import { Tab, TabContainer } from '../types/browser';

interface TabStripProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onToggleMute: (id: string) => void;
}

const CONTAINER_COLORS: Record<TabContainer, string> = {
  default: '#6366f1',
  work: '#3b82f6',
  personal: '#10b981',
  banking: '#f59e0b',
  incognito: '#ec4899',
};

export const TabStrip: React.FC<TabStripProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onToggleMute,
}) => {
  return (
    <div className="tab-strip">
      <div className="tabs-container">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const containerColor = CONTAINER_COLORS[tab.container];

          return (
            <div
              key={tab.id}
              className={`tab-item ${isActive ? 'active' : ''} ${tab.container !== 'default' ? 'container-tab' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              style={
                tab.container !== 'default'
                  ? { borderTop: `2px solid ${containerColor}` }
                  : undefined
              }
            >
              {/* Container or Status Indicator */}
              {tab.container === 'incognito' ? (
                <Lock size={13} className="tab-icon incognito" />
              ) : (
                <Shield size={13} className="tab-icon shield" style={{ color: containerColor }} />
              )}

              {/* Title */}
              <span className="tab-title" title={tab.title}>
                {tab.title || 'New Tab'}
              </span>

              {/* Audio mute button */}
              {tab.isMuted !== undefined && (
                <button
                  className="tab-action-btn mute-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMute(tab.id);
                  }}
                  title={tab.isMuted ? 'Unmute Tab' : 'Mute Tab'}
                >
                  {tab.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
              )}

              {/* Close Button */}
              <button
                className="tab-action-btn close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                title="Close Tab"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* New Tab Button */}
      <button className="new-tab-btn" onClick={onNewTab} title="Open New Tab (Ctrl+T)">
        <Plus size={16} />
      </button>
    </div>
  );
};
