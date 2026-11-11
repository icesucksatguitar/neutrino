import React, { useState, useEffect, useCallback, useRef } from 'react';

interface HomescreenProps {
  isDarkMode?: boolean;
  onNavigate: (url: string) => void;
  onOpenCommandBar?: () => void;
  userName?: string;
}

function formatClockParts(now: Date) {
  return {
    hm: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    seconds: String(now.getSeconds()).padStart(2, '0'),
    dateStr: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

export const Homescreen: React.FC<HomescreenProps> = ({
  isDarkMode = true,
  onNavigate,
  onOpenCommandBar,
  userName,
}) => {
  const [displayName, setDisplayName] = useState<string>(() => {
    if (userName) return userName;
    try {
      const saved = localStorage.getItem('neutrino_user_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) return parsed.name;
      }
    } catch {}
    return 'Yash';
  });

  useEffect(() => {
    if (userName) {
      setDisplayName(userName);
    }
  }, [userName]);

  const initialClock = useRef(formatClockParts(new Date())).current;
  const dateRef = useRef<HTMLDivElement>(null);
  const hmRef = useRef<HTMLSpanElement>(null);
  const secRef = useRef<HTMLSpanElement>(null);
  const greetRef = useRef<HTMLDivElement>(null);

  // Calculate greeting: Good morning / Good afternoon / Good evening *name*
  const getGreeting = useCallback((): string => {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 12) {
      return `Good morning, ${displayName}`;
    } else if (hour >= 12 && hour < 17) {
      return `Good afternoon, ${displayName}`;
    } else {
      return `Good evening, ${displayName}`;
    }
  }, [displayName]);

  useEffect(() => {
    let lastDate = '';
    let lastHm = '';
    let lastGreet = '';

    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = new Date();
      const parts = formatClockParts(now);
      if (hmRef.current && parts.hm !== lastHm) {
        hmRef.current.textContent = parts.hm;
        lastHm = parts.hm;
      }
      if (secRef.current) {
        secRef.current.textContent = parts.seconds;
      }
      if (dateRef.current && parts.dateStr !== lastDate) {
        dateRef.current.textContent = parts.dateStr;
        lastDate = parts.dateStr;
      }
      if (greetRef.current) {
        const nextGreet = getGreeting();
        if (nextGreet !== lastGreet) {
          greetRef.current.textContent = nextGreet;
          lastGreet = nextGreet;
        }
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [getGreeting]);

  // Search URL Bar is revealed by default as a clean minimal pill
  const [isSearchRevealed, setIsSearchRevealed] = useState(true);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing or hitting common navigation keys, reveal search bar immediately
      if (!isSearchRevealed && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        setIsSearchRevealed(true);
        onOpenCommandBar?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchRevealed, onOpenCommandBar]);

  return (
    <div
      className={`neutrino-minimal-newtab ${isSearchFocused ? 'search-focused' : ''}`}
      onClick={() => {
        if (!isSearchRevealed) setIsSearchRevealed(true);
      }}
    >
      {/* 1. Full-Viewport Ambient Background Glow Layer (Gemini-Inspired) */}
      <div className={`ambient-glow-layer ${isSearchFocused ? 'glow-focused' : ''}`} aria-hidden="true">
        <div className="ambient-glow-color-cycle">
          <div className="ambient-glow-container">
            <div className="ambient-glow-blob blob-1" />
            <div className="ambient-glow-blob blob-2" />
            <div className="ambient-glow-blob blob-3" />
            <div className="ambient-glow-blob blob-4" />
          </div>
        </div>
      </div>

      {/* Subtle organic texture grain */}
      <div className="newtab-grain-veil" />

      {/* Main Peaceful Hero Center */}
      <div className="homescreen-hero-center">
        {/* Y Combinator Italic Serif Greeting */}
        <div className="yc-italic-greeting" ref={greetRef}>
          {getGreeting()}
        </div>

        {/* Refined, Smaller Modern Digital Clock */}
        <div className="digital-clock-container compact-clock">
          <div className="digital-clock-date" ref={dateRef}>{initialClock.dateStr}</div>
          <div className="digital-clock-time">
            <span className="digital-clock-digits" ref={hmRef}>{initialClock.hm}</span>
            <span className="digital-clock-seconds" ref={secRef}>{initialClock.seconds}</span>
          </div>
        </div>

        {/* Search URL Bar Pill */}
        <div
          className={`newtab-search-reveal-wrapper ${isSearchRevealed ? 'revealed' : 'hidden'}`}
          onMouseEnter={() => setIsSearchRevealed(true)}
        >
          <div
            className="newtab-prompt-trigger monochromatic-pill"
            tabIndex={0}
            role="button"
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onClick={(e) => {
              e.stopPropagation();
              onOpenCommandBar?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onOpenCommandBar?.();
              }
            }}
            title="Search or enter URL (Ctrl+K or Ctrl+T)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="prompt-text">Search or enter URL</span>
            <div className="prompt-kbd-badge">
              <kbd className="prompt-kbd">Ctrl K</kbd>
            </div>
          </div>
        </div>

        {/* Subtle affordance trigger when search is hidden */}
        {!isSearchRevealed && (
          <button
            type="button"
            className="homescreen-reveal-affordance"
            onClick={(e) => {
              e.stopPropagation();
              setIsSearchRevealed(true);
            }}
            onMouseEnter={() => setIsSearchRevealed(true)}
            aria-label="Search or enter URL"
          >
            <span className="reveal-dot" />
            <span className="reveal-text">Search or enter URL</span>
          </button>
        )}
      </div>
    </div>
  );
};
