import React, { useEffect, useState } from 'react';
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

const PlaceholderIcon: React.FC<{ src?: string }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <Globe size={26} className="nsb-favicon-fallback" aria-hidden="true" />;
  return <img src={src} alt="" width={28} height={28} onError={() => setFailed(true)} />;
};

/** Hover preview next to a sidebar tab: page image (or favicon+title placeholder), title and URL (R18.1, R18.6). */
export const TabPreviewCard: React.FC<TabPreviewCardProps> = ({ preview, onMouseEnter, onMouseLeave }) => {
  const { target, image, status } = preview;
  const pos = previewCardPosition(target.anchor, { width: window.innerWidth, height: window.innerHeight });
  return (
    <div
      className="nsb-preview"
      role="tooltip"
      data-preview-tab-id={target.tabId ?? undefined}
      data-preview-status={status}
      style={{ left: pos.left, top: pos.top, width: PREVIEW_CARD_WIDTH, maxHeight: PREVIEW_CARD_HEIGHT }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="nsb-preview-image">
        {image ? (
          <img src={image} alt="" draggable={false} />
        ) : (
          <div className={`nsb-preview-placeholder ${status === 'loading' ? 'loading' : ''}`}>
            <PlaceholderIcon src={target.favicon} />
            <span className="nsb-preview-placeholder-title">{target.title}</span>
          </div>
        )}
      </div>
      <div className="nsb-preview-meta">
        <div className="nsb-preview-title">{target.title}</div>
        {target.url && <div className="nsb-preview-url">{target.url}</div>}
      </div>
    </div>
  );
};

export default TabPreviewCard;
