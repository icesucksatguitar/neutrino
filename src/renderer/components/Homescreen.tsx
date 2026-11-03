import React, { useState, useRef, useEffect } from 'react';
import { Search, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { Space } from '../types';
import { WorkspaceSlider } from './WorkspaceSlider';

interface HomescreenProps {
  spaces?: Space[];
  activeSpaceId?: string;
  onSelectSpace?: (spaceId: string) => void;
  onNavigate: (url: string) => void;
}

export const Homescreen: React.FC<HomescreenProps> = ({
  spaces = [],
  activeSpaceId = '',
  onSelectSpace,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
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

    onNavigate(target);
  };

  return (
    <div className="homepage-hero-canvas">
      {/* Subtle Ambient Background Composition (Priority 3) */}
      <div className="homepage-ambient-radial" aria-hidden="true" />
      <div className="homepage-micro-grid" aria-hidden="true" />

      {/* Centerpiece Branding & Search Hierarchy */}
      <div className="homepage-main-container">
        {/* Brand Presentation */}
        <div className="homepage-brand-group">
          <div className="homepage-brand-badge">
            <span className="homepage-badge-dot" />
            <span className="homepage-badge-text">LOCAL-FIRST DESKTOP BROWSER</span>
          </div>
          <h1 className="homepage-wordmark">Neutrino</h1>
        </div>

        {/* Central Search / Address Bar */}
        <form className="homepage-search-form" onSubmit={handleSubmit}>
          <Search size={18} className="homepage-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="homepage-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Google or enter address..."
            spellCheck={false}
            autoComplete="off"
          />
          {query.trim().length > 0 && (
            <button
              type="submit"
              className="homepage-search-submit-btn"
              title="Navigate (Enter)"
              aria-label="Submit"
            >
              <ArrowRight size={14} />
            </button>
          )}
        </form>

        {/* Subtle, restrained status hints */}
        <div className="homepage-footer-hints">
          <span className="homepage-hint-item">
            <ShieldCheck size={13} className="homepage-hint-icon" />
            <span>Adblock Active</span>
          </span>
          <span className="homepage-hint-sep">•</span>
          <span className="homepage-hint-item">
            <Zap size={13} className="homepage-hint-icon" />
            <span>Zen Memory Shield</span>
          </span>
          <span className="homepage-hint-sep">•</span>
          <span className="homepage-hint-item">
            <span>Ctrl + T to jump</span>
          </span>
        </div>
      </div>

      {/* Priority 4: Spaces System (Hidden by default, starts with minimal '+' icon) */}
      {spaces.length > 0 && onSelectSpace && (
        <div className="homepage-spaces-corner">
          <WorkspaceSlider
            spaces={spaces}
            activeSpaceId={activeSpaceId}
            onSelectSpace={onSelectSpace}
          />
        </div>
      )}
    </div>
  );
};
