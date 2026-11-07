import React from 'react';

interface FloatingUrlPillProps {
  url?: string;
  onClick: () => void;
}

export const FloatingUrlPill: React.FC<FloatingUrlPillProps> = ({ url, onClick }) => {
  let displayDomain = 'new tab';
  if (url && url !== 'neutrino://newtab' && url !== 'about:blank') {
    try {
      const parsed = new URL(url);
      displayDomain = parsed.hostname.replace(/^www\./, '');
    } catch {
      displayDomain = url;
    }
  }

  return (
    <div
      className="top-floating-url-pill"
      onClick={onClick}
      title="Click or press Ctrl+L to search / enter address"
    >
      <svg className="url-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      <span className="url-domain-text">{displayDomain}</span>
    </div>
  );
};

