import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Shield,
  ShieldAlert,
  Lock,
  Search,
  Star,
  Settings,
  Sliders,
} from 'lucide-react';
import { BrowserSettings } from '../types/browser';

interface NavigationBarProps {
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  blockedCount: number;
  settings: BrowserSettings;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onGoHome: () => void;
  onToggleShieldModal: () => void;
  onToggleSettingsModal: () => void;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({
  currentUrl,
  canGoBack,
  canGoForward,
  isLoading,
  blockedCount,
  settings,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onGoHome,
  onToggleShieldModal,
  onToggleSettingsModal,
}) => {
  const [inputVal, setInputVal] = useState(currentUrl);
  const [isFocused, setIsFocused] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputVal(currentUrl === 'neutrino://newtab' ? '' : currentUrl);
  }, [currentUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    let target = inputVal.trim();
    if (target.startsWith('localhost') || target.startsWith('127.0.0.1')) {
      target = 'http://' + target;
    } else if (!target.includes('://')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = 'https://' + target;
      } else {
        // Search query
        const searchBase =
          settings.searchEngine === 'Brave'
            ? 'https://search.brave.com/search?q='
            : settings.searchEngine === 'Startpage'
            ? 'https://www.startpage.com/sp/search?query='
            : settings.searchEngine === 'Google'
            ? 'https://www.google.com/search?q='
            : 'https://duckduckgo.com/?q=';
        target = `${searchBase}${encodeURIComponent(target)}`;
      }
    }

    onNavigate(target);
    inputRef.current?.blur();
  };

  const isHttps = currentUrl.startsWith('https://');

  return (
    <div className="nav-bar">
      {/* Navigation Buttons */}
      <div className="nav-controls">
        <button
          className="nav-btn"
          disabled={!canGoBack}
          onClick={onGoBack}
          title="Back (Alt+Left)"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          className="nav-btn"
          disabled={!canGoForward}
          onClick={onGoForward}
          title="Forward (Alt+Right)"
        >
          <ArrowRight size={16} />
        </button>
        <button
          className={`nav-btn ${isLoading ? 'spinning' : ''}`}
          onClick={onReload}
          title="Reload (Ctrl+R)"
        >
          <RotateCw size={15} />
        </button>
        <button className="nav-btn" onClick={onGoHome} title="Home">
          <Home size={16} />
        </button>
      </div>

      {/* Omnibox / URL Bar */}
      <form className={`omnibox-form ${isFocused ? 'focused' : ''}`} onSubmit={handleSubmit}>
        <div className="omnibox-wrapper">
          {/* HTTPS / Security Indicator */}
          <div className="security-badge" title={isHttps ? 'Encrypted Connection (TLS 1.3)' : 'Internal / Neutrino Page'}>
            {isHttps ? <Lock size={13} className="lock-icon" /> : <Search size={13} className="search-icon" />}
          </div>

          {/* URL Input */}
          <input
            ref={inputRef}
            type="text"
            className="omnibox-input"
            value={inputVal}
            placeholder={`Search with ${settings.searchEngine} or enter address`}
            onChange={(e) => setInputVal(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              inputRef.current?.select();
            }}
            onBlur={() => setIsFocused(false)}
            spellCheck={false}
          />

          {/* Bookmark Button */}
          <button
            type="button"
            className={`omnibox-btn star-btn ${isBookmarked ? 'active' : ''}`}
            onClick={() => setIsBookmarked(!isBookmarked)}
            title="Bookmark Page"
          >
            <Star size={14} fill={isBookmarked ? '#f59e0b' : 'none'} color={isBookmarked ? '#f59e0b' : 'currentColor'} />
          </button>

          {/* Privacy Shield Pill Button */}
          <button
            type="button"
            className={`shield-pill ${settings.shieldsActive ? 'active' : 'disabled'}`}
            onClick={onToggleShieldModal}
            title="Neutrino Privacy Shields"
          >
            {settings.shieldsActive ? (
              <>
                <Shield size={13} className="shield-icon" />
                <span className="shield-count">{blockedCount}</span>
              </>
            ) : (
              <>
                <ShieldAlert size={13} className="shield-icon warning" />
                <span className="shield-count">Off</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Browser Actions */}
      <div className="browser-actions">
        <button
          className="nav-btn"
          onClick={onToggleSettingsModal}
          title="Browser Settings & Engine Status"
        >
          <Sliders size={16} />
        </button>
        <button
          className="nav-btn"
          onClick={onToggleSettingsModal}
          title="Neutrino Menu"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
};
