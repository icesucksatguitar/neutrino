import React, { useState, useEffect, useRef } from 'react';
import { Lock, Globe, Copy, Check, Search } from 'lucide-react';

export interface FloatingUrlPillProps {
  url?: string;
  isLoading?: boolean;
  zoomFactor?: number;
  onClick: () => void;
  onResetZoom?: () => void;
  onOpenFind?: () => void;
}

  export const FloatingUrlPill: React.FC<FloatingUrlPillProps> = ({
    url,
    isLoading = false,
    zoomFactor = 1.0,
    onClick,
    onResetZoom,
    onOpenFind,
  }) => {
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      };
    }, []);

    const isWebUrl = Boolean(url && (url.startsWith('https://') || url.startsWith('http://')));
    const isHttps = Boolean(url && url.startsWith('https://'));

    let displayDomain = 'new tab';
    if (url && url !== 'neutrino://newtab' && url !== 'about:blank') {
      try {
        const parsed = new URL(url);
        displayDomain = parsed.hostname.replace(/^www\./, '');
      } catch {
        displayDomain = url;
      }
    }

    const handleCopy = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!url || !isWebUrl) return;
      navigator.clipboard?.writeText(url).catch(() => { });
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
    };

    const handleOpenFind = (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpenFind?.();
    };

    const handleResetZoom = (e: React.MouseEvent) => {
      e.stopPropagation();
      onResetZoom?.();
    };

    const showZoomBadge = isWebUrl && Math.abs(zoomFactor - 1.0) > 0.01 && Boolean(onResetZoom);

    return (
      <div
        className={`top-floating-url-pill ${isLoading ? 'loading' : ''} ${isWebUrl ? 'has-actions' : ''}`}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label="Address bar and site controls"
        title={isWebUrl ? `${url}\nClick or press Ctrl+L to search / enter address` : 'Click or press Ctrl+L to search / enter address'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <span className="url-pill-main">
          {isWebUrl && !isHttps ? (
            <Globe className="url-lock-icon insecure" size={12} aria-hidden="true" />
          ) : (
            <Lock className="url-lock-icon" size={12} aria-hidden="true" />
          )}
          <span className="url-domain-text">{displayDomain}</span>
        </span>

        {(isWebUrl || showZoomBadge) && (
          <span className="url-pill-actions">
            {showZoomBadge && (
              <button
                type="button"
                className="url-pill-zoom-badge"
                onClick={handleResetZoom}
                aria-label={`Reset zoom from ${Math.round(zoomFactor * 100)}%`}
                title="Reset zoom to 100% (Ctrl+0)"
              >
                {Math.round(zoomFactor * 100)}%
              </button>
            )}
            {isWebUrl && onOpenFind && (
              <button
                type="button"
                className="url-pill-action-btn"
                onClick={handleOpenFind}
                aria-label="Find in page"
                title="Find in page (Ctrl+F)"
              >
                <Search size={11} />
              </button>
            )}
            {isWebUrl && (
              <button
                type="button"
                className={`url-pill-action-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                aria-label={copied ? 'Copied URL' : 'Copy page URL'}
                title={copied ? 'Copied URL!' : 'Copy current URL'}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
              </button>
            )}
          </span>
        )}
      </div>
    );
  };

