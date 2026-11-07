import React, { useState, useEffect, useRef } from 'react';
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
  onToggleTheme?: () => void;
  onOpenMcp?: () => void;
  onOpenTheme?: () => void;
  onOpenShields?: () => void;
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
  onToggleTheme,
  onOpenMcp,
  onOpenTheme,
  onOpenShields,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter open tabs
  const matchingTabs = tabs.filter(
    (t) =>
      (t.title && t.title.toLowerCase().includes(query.toLowerCase())) ||
      (t.url && t.url.toLowerCase().includes(query.toLowerCase()))
  );

  // Command items prefixed with ">"
  const commands = [
    {
      id: 'cmd-theme',
      title: '> Toggle Dark / Light Theme',
      hint: 'Ctrl+Shift+D',
      action: () => onToggleTheme?.(),
    },
    {
      id: 'cmd-new-tab',
      title: '> Open New Tab',
      hint: 'Ctrl+T',
      action: () => onCreateTab(),
    },
    {
      id: 'cmd-sleep-tabs',
      title: '> Put Inactive Tabs to Sleep (Zen Memory Mode)',
      hint: 'Ctrl+Shift+Z',
      action: () => onZenOptimize(),
    },
    {
      id: 'cmd-toggle-shields',
      title: '> Toggle Tracker & Ad Protection',
      hint: 'Shields',
      action: () => onToggleShields(),
    },
    {
      id: 'cmd-mcp',
      title: '> Open AI Assistants & MCP Tools',
      hint: 'MCP',
      action: () => {
        onOpenMcp?.();
        onClose();
      },
    },
    {
      id: 'cmd-theme-studio',
      title: '> Open Themes & Appearance Studio',
      hint: 'Studio',
      action: () => {
        onOpenTheme?.();
        onClose();
      },
    },
    {
      id: 'cmd-shields-stats',
      title: '> View Shield Protection & Blocked Trackers',
      hint: 'Privacy',
      action: () => {
        onOpenShields?.();
        onClose();
      },
    },
  ].filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));

  const items: Array<{
    type: 'tab' | 'command' | 'url';
    id: string;
    title: string;
    subline?: string;
    hint?: string;
    favicon?: string;
    action: () => void;
  }> = [];

  // If user typed something that looks like search/url
  if (query.trim()) {
    items.push({
      type: 'url',
      id: 'item-navigate',
      title: `Navigate to "${query.trim()}"`,
      subline: query.includes('.') ? 'Go to URL' : 'Search with Google',
      hint: '↵ to go',
      action: () => {
        let target = query.trim();
        if (!target.includes('://') && target.includes('.') && !target.includes(' ')) {
          target = 'https://' + target;
        } else if (!target.includes('://')) {
          target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
        }
        onNavigate(target);
        onClose();
      },
    });
  }

  // Add tabs
  matchingTabs.forEach((tab) => {
    items.push({
      type: 'tab',
      id: tab.id,
      title: tab.title || 'Untitled Tab',
      subline: tab.url,
      hint: 'Switch to tab',
      favicon: tab.favicon,
      action: () => {
        onSelectTab(tab.id);
        onClose();
      },
    });
  });

  // Add commands
  commands.forEach((c) => {
    items.push({
      type: 'command',
      id: c.id,
      title: c.title,
      hint: c.hint,
      action: () => {
        c.action();
        onClose();
      },
    });
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (items.length ? (prev + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (items.length ? (prev - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].action();
      }
    }
  };

  return (
    <div className="command-bar-modal-backdrop" onClick={onClose}>
      <div className="command-bar-card-wrapper" onClick={(e) => e.stopPropagation()}>
        <div className="command-bar-input-strip">
          <svg className="cmd-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="command-bar-raw-input"
            placeholder="Search, jump to tab, or type > for commands..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <div className="command-bar-inline-hints">
            <span><kbd>Tab</kbd> search tabs</span>
            <span><kbd>↵</kbd> go</span>
          </div>
        </div>

        {items.length > 0 && (
          <div className="command-bar-results-list">
            {items.slice(0, 8).map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  className={`cmd-result-item ${isSelected ? 'selected' : ''}`}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  {item.favicon ? (
                    <img src={item.favicon} alt="" className="cmd-favicon" />
                  ) : item.type === 'command' ? (
                    <span className="cmd-symbol">&gt;</span>
                  ) : (
                    <svg className="cmd-default-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                    </svg>
                  )}

                  <div className="cmd-text-block">
                    <span className="cmd-primary-text">{item.title}</span>
                    {item.subline && <span className="cmd-secondary-text">{item.subline}</span>}
                  </div>

                  {item.hint && <span className="cmd-item-badge">{item.hint}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
