import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import {
  PREVIEW_CARD_HEIGHT,
  PREVIEW_CARD_WIDTH,
  previewCardPosition,
  type HoverPreviewState,
} from '../utils/hoverPreview';

export interface TabPreviewCardProps {
  preview: HoverPreviewState;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function parsePreviewDomain(url?: string): { domain: string; isNewTab: boolean; isInternal: boolean } {
  if (!url || url === 'neutrino://newtab' || url === 'about:blank') {
    return { domain: 'new tab', isNewTab: true, isInternal: true };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'neutrino:') {
      return { domain: parsed.hostname || 'neutrino', isNewTab: false, isInternal: true };
    }
    return { domain: parsed.hostname.replace(/^www\./, ''), isNewTab: false, isInternal: false };
  } catch {
    return { domain: url.replace(/^https?:\/\//, '').split('/')[0] || 'neutrino', isNewTab: false, isInternal: false };
  }
}

/**
 * Stylized procedural mini-window mockups when no bitmap preview is available,
 * adopting the clean aesthetics from commit 7704421b.
 */
const PreviewMockup: React.FC<{ url?: string; domain: string; isNewTab: boolean }> = ({ url = '', domain, isNewTab }) => {
  if (isNewTab || url.startsWith('neutrino://newtab')) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return (
      <div className="mini-win-preview-mockup newtab-mockup">
        <div className="mockup-clock-badge">{timeStr}</div>
        <div className="mockup-search-pill">
          <span className="mockup-dot" />
          <span>Where to?</span>
        </div>
      </div>
    );
  }

  const d = domain.toLowerCase();
  if (d.includes('youtube') || d.includes('vimeo') || d.includes('twitch') || url.includes('/watch?v=')) {
    return (
      <div className="mini-win-preview-mockup youtube-mockup">
        <div className="mockup-video-canvas">
          <div className="mockup-play-icon">▶</div>
        </div>
        <div className="mockup-line-group">
          <div className="mockup-line long" />
          <div className="mockup-line short" />
        </div>
      </div>
    );
  }

  if (
    d.includes('github') ||
    d.includes('gitlab') ||
    d.includes('linear') ||
    d.includes('stackoverflow') ||
    d.includes('npm') ||
    d.includes('dev.to') ||
    d.includes('docs')
  ) {
    return (
      <div className="mini-win-preview-mockup code-mockup">
        <div className="mockup-code-sidebar" />
        <div className="mockup-code-body">
          <div className="mockup-line accent" />
          <div className="mockup-line medium" />
          <div className="mockup-line long" />
          <div className="mockup-line short" />
        </div>
      </div>
    );
  }

  return (
    <div className="mini-win-preview-mockup generic-mockup">
      <div className="mockup-web-nav">
        <span className="mockup-pill-tag">{domain}</span>
      </div>
      <div className="mockup-content-grid">
        <div className="mockup-card-block" />
        <div className="mockup-line-group">
          <div className="mockup-line long" />
          <div className="mockup-line medium" />
          <div className="mockup-line short" />
        </div>
      </div>
    </div>
  );
};

/** Hover preview next to a sidebar tab: mini-window chrome, live capture/mockup and domain pill (R18.1, R18.6). */
export const TabPreviewCard: React.FC<TabPreviewCardProps> = ({ preview, onMouseEnter, onMouseLeave }) => {
  const { target, image, status } = preview;
  const pos = previewCardPosition(target.anchor, { width: window.innerWidth, height: window.innerHeight });
  const [favFailed, setFavFailed] = useState(false);
  const domainInfo = parsePreviewDomain(target.url);

  return (
    <div
      className="nsb-preview mini-window-card mini-window-tab-card"
      role="tooltip"
      data-preview-tab-id={target.tabId ?? undefined}
      data-preview-status={status}
      style={{ left: pos.left, top: pos.top, width: PREVIEW_CARD_WIDTH, maxHeight: PREVIEW_CARD_HEIGHT }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Window Chrome Header */}
      <div className="mini-win-header nsb-preview-header">
        <div className="mini-win-controls" aria-hidden="true">
          <span className="mini-win-dot red" />
          <span className="mini-win-dot yellow" />
          <span className="mini-win-dot green" />
        </div>
        <div className="mini-win-title-group">
          {target.favicon && !favFailed ? (
            <img
              src={target.favicon}
              alt=""
              className="mini-win-favicon"
              onError={() => setFavFailed(true)}
            />
          ) : (
            <div className="mini-win-favicon-placeholder">
              {domainInfo.domain.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="mini-win-title" title={target.title || domainInfo.domain}>
            {target.title || domainInfo.domain}
          </span>
        </div>
        {target.isSleeping && (
          <span className="mini-win-sleep-badge" title="Sleeping to free memory">
            Sleeping
          </span>
        )}
      </div>

      {/* Window Preview Frame */}
      <div className="mini-win-preview-frame nsb-preview-image">
        {image && image.startsWith('data:image/') ? (
          <img src={image} alt="" draggable={false} className="mini-win-captured-img" />
        ) : (
          <PreviewMockup url={target.url} domain={domainInfo.domain} isNewTab={domainInfo.isNewTab} />
        )}
        {status === 'loading' && <div className="nsb-preview-shimmer" aria-hidden="true" />}
        {/* Domain Watermark Pill */}
        <div className="mini-win-domain-pill">{domainInfo.domain}</div>
      </div>

      {/* Window Footer Meta */}
      <div className="nsb-preview-meta">
        <div className="nsb-preview-title" title={target.title}>{target.title}</div>
        {target.url && (
          <div className="nsb-preview-url-row">
            <Globe size={11} className="nsb-preview-globe" aria-hidden="true" />
            <span className="nsb-preview-url" title={target.url}>{target.url}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TabPreviewCard;
