import React, { useState } from 'react';
import { Search, Shield, Globe, Lock, ArrowUpRight, Cpu } from 'lucide-react';
import { ShieldStats } from '../types/browser';

interface NewTabDashboardProps {
  onNavigate: (url: string) => void;
  stats: ShieldStats;
  searchEngine: string;
}

const SHORTCUTS = [
  { name: 'GitHub', url: 'https://github.com', category: 'Dev' },
  { name: 'Mozilla Central', url: 'https://searchfox.org/mozilla-central', category: 'Gecko' },
  { name: 'Rust Lang', url: 'https://doc.rust-lang.org', category: 'Rust' },
  { name: 'MDN Web Docs', url: 'https://developer.mozilla.org', category: 'Docs' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', category: 'Search' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com', category: 'Tech' },
];

export const NewTabDashboard: React.FC<NewTabDashboardProps> = ({
  onNavigate,
  stats,
  searchEngine,
}) => {
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onNavigate(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="newtab-dashboard">
      <div className="newtab-content">
        {/* Logo and Brand */}
        <div className="brand-header">
          <div className="brand-logo-glow">
            <Shield size={44} className="brand-icon" />
          </div>
          <h1 className="brand-title">Neutrino</h1>
          <p className="brand-tagline">Firefox Engine • Rust Privacy Core • React UI</p>
        </div>

        {/* Central Search Box */}
        <form className="central-search-form" onSubmit={handleSearch}>
          <Search size={18} className="search-bar-icon" />
          <input
            type="text"
            className="central-search-input"
            placeholder={`Search the web privately with ${searchEngine}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </form>

        {/* Quick Dial Shortcuts */}
        <div className="shortcuts-grid">
          {SHORTCUTS.map((item) => (
            <div
              key={item.name}
              className="shortcut-card"
              onClick={() => onNavigate(item.url)}
            >
              <div className="shortcut-icon-wrapper">
                <Globe size={18} />
              </div>
              <div className="shortcut-meta">
                <span className="shortcut-name">{item.name}</span>
                <span className="shortcut-category">{item.category}</span>
              </div>
              <ArrowUpRight size={13} className="shortcut-arrow" />
            </div>
          ))}
        </div>

        {/* Shield Overview Dashboard */}
        <div className="privacy-overview-card">
          <div className="overview-header">
            <div className="overview-title">
              <Lock size={15} />
              <span>Real-time Shield Protection</span>
            </div>
            <span className="badge-active">Online</span>
          </div>

          <div className="overview-stats-row">
            <div className="overview-stat">
              <span className="overview-val">{stats.totalBlocked}</span>
              <span className="overview-lbl">Blocked Trackers</span>
            </div>
            <div className="overview-divider"></div>
            <div className="overview-stat">
              <span className="overview-val">{stats.activeRulesCount}</span>
              <span className="overview-lbl">Active Rules</span>
            </div>
            <div className="overview-divider"></div>
            <div className="overview-stat">
              <span className="overview-val">Enabled</span>
              <span className="overview-lbl">Total Cookie Protection</span>
            </div>
            <div className="overview-divider"></div>
            <div className="overview-stat">
              <span className="overview-val">
                <Cpu size={14} style={{ display: 'inline', marginRight: 4 }} />
                Active
              </span>
              <span className="overview-lbl">Rust Native Engine</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
