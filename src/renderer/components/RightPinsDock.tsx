import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, Globe, ExternalLink } from 'lucide-react';

export interface PinnedSite {
  id: string;
  title: string;
  url: string;
  icon?: string;
}

const DEFAULT_PINS: PinnedSite[] = [
  { id: 'pin-yt', title: 'YouTube', url: 'https://www.youtube.com' },
  { id: 'pin-gh', title: 'GitHub', url: 'https://github.com' },
  { id: 'pin-x', title: 'X', url: 'https://x.com' },
  { id: 'pin-rd', title: 'Reddit', url: 'https://www.reddit.com' },
  { id: 'pin-notion', title: 'Notion', url: 'https://www.notion.so' },
];

interface RightPinsDockProps {
  onNavigate: (url: string) => void;
}

export const RightPinsDock: React.FC<RightPinsDockProps> = ({ onNavigate }) => {
  const [pins, setPins] = useState<PinnedSite[]>(() => {
    try {
      const saved = localStorage.getItem('neutrino_pinned_sites');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_PINS;
  });

  const [scales, setScales] = useState<{ [id: string]: number }>({});
  const [isHoveredDock, setIsHoveredDock] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);

  const dockRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});

  const savePins = (updated: PinnedSite[]) => {
    setPins(updated);
    try {
      localStorage.setItem('neutrino_pinned_sites', JSON.stringify(updated));
    } catch {}
  };

  // macOS Dock Fish-Eye Magnification physics
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const dock = dockRef.current;
    if (!dock) return;

    const dockRect = dock.getBoundingClientRect();
    const mouseY = e.clientY;
    const maxRadius = 72; // Influence radius in px
    const maxScale = 1.48; // Peak magnification scale

    const newScales: { [id: string]: number } = {};

    [...pins.map(p => p.id), 'add-btn'].forEach((id) => {
      const el = itemRefs.current[id];
      if (!el) {
        newScales[id] = 1;
        return;
      }

      const rect = el.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const dist = Math.abs(mouseY - centerY);

      if (dist < maxRadius) {
        // Cosine falloff curve for organic fluid magnification
        const factor = Math.cos((dist / maxRadius) * (Math.PI / 2));
        newScales[id] = 1 + (maxScale - 1) * Math.pow(factor, 1.5);
      } else {
        newScales[id] = 1;
      }
    });

    setScales(newScales);
  }, [pins]);

  const handleMouseLeave = () => {
    setIsHoveredDock(false);
    setScales({});
    setHoveredPinId(null);
  };

  const handleAddPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;

    let formattedUrl = newUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }

    let title = newTitle.trim();
    if (!title) {
      try {
        const urlObj = new URL(formattedUrl);
        title = urlObj.hostname.replace('www.', '').split('.')[0];
        title = title.charAt(0).toUpperCase() + title.slice(1);
      } catch {
        title = 'Website';
      }
    }

    const newPin: PinnedSite = {
      id: `pin-${Date.now()}`,
      title,
      url: formattedUrl,
    };

    const updated = [...pins, newPin];
    savePins(updated);
    setNewUrl('');
    setNewTitle('');
    setIsAddModalOpen(false);
  };

  const handleDeletePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = pins.filter((p) => p.id !== id);
    savePins(updated);
  };

  const getFaviconUrl = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      return '';
    }
  };

  return (
    <>
      <aside
        className="vertical-pins-dock-container"
        ref={dockRef}
        onMouseMove={(e) => {
          setIsHoveredDock(true);
          handleMouseMove(e);
        }}
        onMouseLeave={handleMouseLeave}
        aria-label="Pinned Websites Dock"
      >
        <div className="vertical-pins-dock-track">
          {pins.map((pin) => {
            const scale = scales[pin.id] || 1;
            const favicon = getFaviconUrl(pin.url);
            const isItemHovered = hoveredPinId === pin.id;

            return (
              <div
                key={pin.id}
                ref={(el) => (itemRefs.current[pin.id] = el)}
                className="pin-dock-item"
                style={{
                  transform: `scale(${scale}) translateX(${scale > 1.05 ? -(scale - 1) * 14 : 0}px)`,
                  zIndex: Math.round(scale * 10),
                }}
                onClick={() => onNavigate(pin.url)}
                onMouseEnter={() => setHoveredPinId(pin.id)}
                onMouseLeave={() => setHoveredPinId(null)}
                title={pin.title}
              >
                {/* Monochromatic Frosted Icon Capsule */}
                <div className="pin-dock-icon-capsule">
                  {favicon ? (
                    <img
                      src={favicon}
                      alt={pin.title}
                      className="pin-dock-favicon"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Globe size={18} className="pin-dock-fallback-icon" />
                  )}

                  {/* Remove pill button when hovered */}
                  {isItemHovered && (
                    <button
                      className="pin-dock-remove-btn"
                      onClick={(e) => handleDeletePin(e, pin.id)}
                      title={`Unpin ${pin.title}`}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>

                {/* macOS Style Name Tooltip */}
                {isItemHovered && (
                  <div className="pin-dock-tooltip">
                    <span>{pin.title}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Divider hairline */}
          <div className="pin-dock-divider" />

          {/* Add Pin + Icon Button */}
          <div
            ref={(el) => (itemRefs.current['add-btn'] = el)}
            className="pin-dock-item pin-dock-add-item"
            style={{
              transform: `scale(${scales['add-btn'] || 1})`,
            }}
            onClick={() => setIsAddModalOpen(true)}
            title="Add Website Pin"
          >
            <div className="pin-dock-icon-capsule add-capsule">
              <Plus size={16} />
            </div>
            {hoveredPinId === 'add-btn' && (
              <div className="pin-dock-tooltip">
                <span>Add website</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Add Website Pin Modal */}
      {isAddModalOpen && (
        <div className="pin-add-modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <div className="pin-add-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="pin-add-modal-header">
              <h3>Pin Website</h3>
              <button
                className="pin-add-close-btn"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleAddPin} className="pin-add-modal-body">
              <div className="pin-add-field">
                <label htmlFor="pin-url">Website URL</label>
                <input
                  id="pin-url"
                  type="text"
                  autoFocus
                  placeholder="https://linear.app"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="pin-add-input"
                />
              </div>

              <div className="pin-add-field">
                <label htmlFor="pin-title">Display Name (Optional)</label>
                <input
                  id="pin-title"
                  type="text"
                  placeholder="Linear"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="pin-add-input"
                />
              </div>

              <div className="pin-add-actions">
                <button
                  type="button"
                  className="pin-add-cancel-btn"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pin-add-submit-btn">
                  Pin to Dock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

