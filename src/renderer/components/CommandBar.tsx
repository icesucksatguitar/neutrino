import React, { useState, useEffect, useRef } from 'react';
import { Search, Globe, Plus, Moon, Shield, Folder } from 'lucide-react';
import { TabState, Space } from '../types';

interface CommandBarProps {
  isOpen: boolean;
  tabs: TabState[];
  spaces: Space[];
  onClose: () => void;
  onNavigate: (url: string) => void;
  onSelectTab: (id: string) => void;
  onCreateTab: (url?: string) => void;
  onZenOptimize: () => void;
  onToggleShields: () => void;
  onSelectSpace: (spaceId: string) => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  isOpen,
  tabs,
  spaces,
  onClose,
  onNavigate,
  onSelectTab,
  onCreateTab,
  onZenOptimize,
  onToggleShields,
  onSelectSpace,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter open tabs by query
  const matchingTabs = tabs.filter(
    (t) =>
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.url.toLowerCase().includes(query.toLowerCase())
  );

  // Quick action items
  const actions = [
    {
      id: 'action-new-tab',
      title: query ? `Open: ${query}` : 'New Tab',
      hint: 'Enter to open',
      icon: <Plus size={16} />,
      execute: () => {
        if (!query.trim()) {
          onCreateTab();
        } else {
          let target = query.trim();
          if (!target.includes('://') && target.includes('.') && !target.includes(' ')) {
            target = 'https://' + target;
          } else if (!target.includes('://')) {
            target = `https://duckduckgo.com/?q=${encodeURIComponent(target)}`;
          }
          onNavigate(target);
        }
      },
    },
    {
      id: 'action-zen-sleep',
      title: 'Hibernate Background Tabs (Zen Low Resource)',
      hint: 'Frees unused RAM',
      icon: <Moon size={16} />,
      execute: () => onZenOptimize(),
    },
    {
      id: 'action-toggle-shields',
      title: 'Toggle Brave Shields & Privacy Filter',
      hint: 'Block ads and tracking',
      icon: <Shield size={16} />,
      execute: () => onToggleShields(),
    },
    ...spaces.map((s) => ({
      id: `action-space-${s.id}`,
      title: `Switch Space: ${s.name}`,
      hint: 'Space',
      icon: <Folder size={16} style={{ color: s.color }} />,
      execute: () => onSelectSpace(s.id),
    })),
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < matchingTabs.length) {
        onSelectTab(matchingTabs[selectedIndex].id);
      } else {
        const actionIdx = selectedIndex - matchingTabs.length;
        if (actions[actionIdx]) {
          actions[actionIdx].execute();
        }
      }
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const total = matchingTabs.length + actions.length;
      setSelectedIndex((prev) => (prev + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const total = matchingTabs.length + actions.length;
      setSelectedIndex((prev) => (prev - 1 + total) % total);
    }
  };

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div className="command-palette-card" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrapper">
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder="Type a URL, search, or command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <span className="shortcut-kbd">ESC to close</span>
        </div>

        <div className="palette-results-list">
          {/* Matching Open Tabs */}
          {matchingTabs.map((tab, idx) => (
            <div
              key={tab.id}
              className={`palette-item ${selectedIndex === idx ? 'selected' : ''}`}
              onClick={() => {
                onSelectTab(tab.id);
                onClose();
              }}
            >
              <Globe size={16} style={{ color: 'var(--accent)' }} />
              <span className="item-title">{tab.title}</span>
              <span className="item-hint">Switch Tab</span>
            </div>
          ))}

          {/* Actions */}
          {actions.map((act, idx) => {
            const actualIndex = matchingTabs.length + idx;
            return (
              <div
                key={act.id}
                className={`palette-item ${selectedIndex === actualIndex ? 'selected' : ''}`}
                onClick={() => {
                  act.execute();
                  onClose();
                }}
              >
                {act.icon}
                <span className="item-title">{act.title}</span>
                <span className="item-hint">{act.hint}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
