import React, { useState, useEffect, useCallback } from 'react';

interface HomescreenProps {
  isDarkMode?: boolean;
  onNavigate: (url: string) => void;
  onOpenCommandBar?: () => void;
  userName?: string;
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

  const [time, setTime] = useState<{
    hours: string;
    minutes: string;
    seconds: string;
    dateStr: string;
  }>(() => {
    const now = new Date();
    return {
      hours: String(now.getHours()).padStart(2, '0'),
      minutes: String(now.getMinutes()).padStart(2, '0'),
      seconds: String(now.getSeconds()).padStart(2, '0'),
      dateStr: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    };
  });

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

  const [greeting, setGreeting] = useState<string>(getGreeting);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime({
        hours: String(now.getHours()).padStart(2, '0'),
        minutes: String(now.getMinutes()).padStart(2, '0'),
        seconds: String(now.getSeconds()).padStart(2, '0'),
        dateStr: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      });
      setGreeting(getGreeting());
    };

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [getGreeting]);

  // Keep search URL bar hidden at first; reveal on hover, click, or keyboard input
  const [isSearchRevealed, setIsSearchRevealed] = useState(false);

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
      className="neutrino-minimal-newtab"
      onClick={() => {
        if (!isSearchRevealed) setIsSearchRevealed(true);
      }}
    >
      {/* Subtle organic texture grain */}
      <div className="newtab-grain-veil" />

      {/* Main Peaceful Hero Center */}
      <div className="homescreen-hero-center">
        {/* Y Combinator Italic Serif Greeting */}
        <div className="yc-italic-greeting">
          {greeting}
        </div>

        {/* Refined, Smaller Modern Digital Clock */}
        <div className="digital-clock-container compact-clock">
          <div className="digital-clock-date">{time.dateStr}</div>
          <div className="digital-clock-time">
            <span className="digital-clock-digits">{time.hours}:{time.minutes}</span>
            <span className="digital-clock-seconds">{time.seconds}</span>
          </div>
        </div>

        {/* Search URL Bar: Hidden at first, smoothly revealed on hover or click */}
        <div
          className={`newtab-search-reveal-wrapper ${isSearchRevealed ? 'revealed' : 'hidden'}`}
          onMouseEnter={() => setIsSearchRevealed(true)}
        >
          <div
            className="newtab-prompt-trigger monochromatic-pill"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCommandBar?.();
            }}
            title="Search or enter URL (Ctrl+K or Ctrl+T)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="prompt-text">Where to?</span>
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
