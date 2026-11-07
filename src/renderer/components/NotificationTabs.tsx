import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TabState, SpaceState } from '../types';

interface NotificationTabsProps {
  tabs: TabState[];
  activeTabId: string | null;
  spaces?: SpaceState[];
  activeSpaceId?: string;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (url?: string, spaceId?: string) => void;
  onTogglePinTab: (tabId: string) => void;
  onSelectSpace?: (spaceId: string) => void;
  onUndoClose?: () => void;
}

export const NotificationTabs: React.FC<NotificationTabsProps> = ({
  tabs,
  activeTabId,
  spaces = [],
  activeSpaceId,
  isOpen,
  onToggle,
  onSelectTab,
  onCloseTab,
  onCreateTab,
  onTogglePinTab,
  onSelectSpace,
  onUndoClose,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [swipingTabId, setSwipingTabId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [undoToast, setUndoToast] = useState<{ title: string; visible: boolean } | null>(null);
  const [previews, setPreviews] = useState<{ [tabId: string]: string }>({});

  // Proper Exit Fade-Out Animation Lifecycle: 'closed' | 'open' | 'closing'
  const [renderStatus, setRenderStatus] = useState<'closed' | 'open' | 'closing'>('closed');
  const closeAnimTimerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      if (closeAnimTimerRef.current) {
        clearTimeout(closeAnimTimerRef.current);
        closeAnimTimerRef.current = null;
      }
      setRenderStatus('open');
    } else {
      if (renderStatus === 'open') {
        setRenderStatus('closing');
        closeAnimTimerRef.current = setTimeout(() => {
          setRenderStatus('closed');
        }, 260); // Matches smooth exit animation duration
      }
    }
    return () => {
      if (closeAnimTimerRef.current) clearTimeout(closeAnimTimerRef.current);
    };
  }, [isOpen]);

  const startXRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const autoCloseTimerRef = useRef<any>(null);
  const toastTimerRef = useRef<any>(null);

  const displaySpaces = spaces.length > 0 ? spaces : [
    { id: 'space-study', name: 'Study', color: '#E4E4E7' },
    { id: 'space-work', name: 'Work', color: '#A1A1AA' },
    { id: 'space-leisure', name: 'Leisure', color: '#71717A' },
  ];

  const currentSpaceIndex = Math.max(
    0,
    displaySpaces.findIndex((s) => s.id === activeSpaceId || s.name.toLowerCase() === activeSpaceId?.toLowerCase())
  );

  // Left-edge hover detection: cursor <= 8px from left edge drops tabs in
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX <= 8 && !isOpen) {
        onToggle(true);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isOpen, onToggle]);

  // Keyboard shortcut: Cmd+E / Ctrl+E to toggle tabs, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        onToggle(!isOpen);
      } else if (e.key === 'Escape' && isOpen) {
        onToggle(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onToggle]);

  // Capture real webview previews when tab drawer opens
  useEffect(() => {
    if (renderStatus !== 'open' || !window.neutrino?.captureTabPreview) return;
    tabs.forEach((tab) => {
      if (tab.url && tab.url !== 'neutrino://newtab' && !previews[tab.id]) {
        window.neutrino!.captureTabPreview(tab.url).then((imgData) => {
          if (imgData) {
            setPreviews((prev) => ({ ...prev, [tab.id]: imgData }));
          }
        }).catch(() => {});
      }
    });
  }, [renderStatus, tabs, previews]);

  const handleMouseEnterDeck = () => {
    setIsHovered(true);
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  const handleMouseLeaveDeck = () => {
    setIsHovered(false);
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    // Auto-dismiss smoothly when mouse leaves the deck after 420ms
    autoCloseTimerRef.current = setTimeout(() => {
      onToggle(false);
    }, 420);
  };

  const handleSelectTabAndClose = (tabId: string) => {
    onSelectTab(tabId);
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    onToggle(false);
  };

  const handleCreateTabAndClose = () => {
    onCreateTab();
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    onToggle(false);
  };

  const handlePointerDown = (id: string, e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    isDraggingRef.current = true;
    setSwipingTabId(id);
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !swipingTabId) return;
    const delta = e.clientX - startXRef.current;
    if (delta < 0) {
      setSwipeOffset(delta);
    }
  };

  const handlePointerUp = (tab: TabState) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (swipeOffset < -80) {
      // Swiped far enough to dismiss
      onCloseTab(tab.id);
      setUndoToast({ title: tab.title || 'Tab', visible: true });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setUndoToast(null);
      }, 4000);
    }
    setSwipingTabId(null);
    setSwipeOffset(0);
  };

  const parseDomain = (url: string) => {
    try {
      if (!url || url === 'neutrino://newtab' || url === 'about:blank') {
        return { domain: 'new tab', isNewTab: true };
      }
      const u = new URL(url);
      return { domain: u.hostname.replace(/^www\./, ''), isNewTab: false };
    } catch {
      return { domain: 'neutrino', isNewTab: false };
    }
  };

  // Render stylized mini window mockups when no bitmap preview is available
  const renderPreviewMockup = (tab: TabState) => {
    const { domain, isNewTab } = parseDomain(tab.url || '');

    if (isNewTab) {
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

    if (domain.includes('youtube')) {
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

    if (domain.includes('github') || domain.includes('linear')) {
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

  const pinnedTabs = tabs.filter((t) => t.isPinned);
  const normalTabs = tabs.filter((t) => !t.isPinned);

  // ==========================================
  // Proper Interactive Draggable Space Slider
  // ==========================================
  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const isDraggingSliderRef = useRef<boolean>(false);
  const [sliderDragRatio, setSliderDragRatio] = useState<number | null>(null);

  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = sliderTrackRef.current;
    if (!track) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    isDraggingSliderRef.current = true;
    updateSliderFromPointer(e.clientX);
  };

  const handleSliderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSliderRef.current) return;
    updateSliderFromPointer(e.clientX);
  };

  const updateSliderFromPointer = (clientX: number) => {
    const track = sliderTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const clampedX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = rect.width > 0 ? clampedX / rect.width : 0;
    setSliderDragRatio(ratio);
  };

  const handleSliderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSliderRef.current) return;
    isDraggingSliderRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    const track = sliderTrackRef.current;
    if (!track) {
      setSliderDragRatio(null);
      return;
    }

    const rect = track.getBoundingClientRect();
    const clampedX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = rect.width > 0 ? clampedX / rect.width : 0;

    // Snap to closest space segment
    const segmentCount = displaySpaces.length;
    const targetIdx = Math.max(
      0,
      Math.min(segmentCount - 1, Math.round(ratio * (segmentCount - 1)))
    );

    setSliderDragRatio(null);
    const targetSpace = displaySpaces[targetIdx];
    if (targetSpace && onSelectSpace) {
      onSelectSpace(targetSpace.id);
    }
  };

  // Calculate thumb position: live drag ratio OR active space index
  const activeRatio = sliderDragRatio !== null
    ? sliderDragRatio
    : (displaySpaces.length > 1 ? currentSpaceIndex / (displaySpaces.length - 1) : 0);

  return (
    <>
      {/* Collapsed State: Left Hairlines (Always rendered when deck is closed) */}
      {renderStatus === 'closed' && (
        <div
          className="notification-hairlines-container"
          onMouseEnter={() => onToggle(true)}
          title="Move cursor to edge or press Ctrl+E to open tabs"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={`tab-hairline-marker ${isActive ? 'active' : ''} ${tab.isSleeping ? 'sleeping' : ''}`}
                onClick={() => onSelectTab(tab.id)}
              />
            );
          })}
        </div>
      )}

      {/* Expanded State: Sliding Mini-Window Preview Cards Deck with Fade-In AND Fade-Out Animation */}
      {renderStatus !== 'closed' && (
        <div
          className={`notification-tabs-deck ${renderStatus === 'closing' ? 'deck-anim-closing' : 'deck-anim-open'}`}
          onMouseEnter={handleMouseEnterDeck}
          onMouseLeave={handleMouseLeaveDeck}
        >
          {/* Deck Header: Title & New Tab */}
          <div className="notification-deck-header">
            <span className="deck-title">Spaces & Tabs</span>
            <button
              className="deck-new-tab-btn"
              onClick={handleCreateTabAndClose}
              title="New Tab (Ctrl+T)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New</span>
            </button>
          </div>

          {/* Pinned Tabs: Compact Favicon-Only Squares at Top */}
          {pinnedTabs.length > 0 && (
            <div className="pinned-tabs-grid">
              {pinnedTabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const domainInfo = parseDomain(tab.url || '');
                return (
                  <div
                    key={tab.id}
                    className={`pinned-tab-square ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectTabAndClose(tab.id)}
                    title={tab.title || domainInfo.domain}
                  >
                    {tab.favicon ? (
                      <img src={tab.favicon} alt="" className="pinned-favicon" />
                    ) : (
                      <div className="pinned-placeholder-fav">
                        {domainInfo.domain.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab Stack as Mini-Window Previews */}
          <div className={`notification-card-stack mini-window-deck ${isHovered ? 'fan-out' : ''}`}>
            {normalTabs.map((tab, idx) => {
              const isActive = tab.id === activeTabId;
              const isSwiping = swipingTabId === tab.id;
              const domainInfo = parseDomain(tab.url || '');
              const previewImg = previews[tab.id];

              return (
                <div
                  key={tab.id}
                  className={`mini-window-card ${isActive ? 'active' : ''} ${tab.isSleeping ? 'sleeping' : ''} ${isSwiping ? 'swiping' : ''}`}
                  style={{
                    animationDelay: `${idx * 28}ms`,
                    transform: isSwiping ? `translateX(${swipeOffset}px)` : undefined,
                    opacity: isSwiping ? Math.max(0.2, 1 - Math.abs(swipeOffset) / 180) : undefined,
                  }}
                  onClick={() => handleSelectTabAndClose(tab.id)}
                  onPointerDown={(e) => handlePointerDown(tab.id, e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => handlePointerUp(tab)}
                >
                  {/* Window Chrome Header */}
                  <div className="mini-win-header">
                    <div className="mini-win-title-group">
                      {tab.favicon ? (
                        <img src={tab.favicon} alt="" className="mini-win-favicon" />
                      ) : (
                        <div className="mini-win-favicon-placeholder">
                          {domainInfo.domain.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="mini-win-title" title={tab.title || domainInfo.domain}>
                        {tab.title || domainInfo.domain}
                      </span>
                    </div>

                    {/* Window Controls: Pin & Close */}
                    <button
                      className="mini-win-close-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      title="Close Tab"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Window Preview Body */}
                  <div className="mini-win-preview-frame">
                    {typeof previewImg === 'string' && previewImg.startsWith('data:image/') ? (
                      <img src={previewImg} alt="Preview" className="mini-win-captured-img" />
                    ) : (
                      renderPreviewMockup(tab)
                    )}
                    {/* Domain Watermark Pill */}
                    <div className="mini-win-domain-pill">{domainInfo.domain}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Proper Interactive Draggable Spaces Slider (Bottom-Left) */}
          <div className="spaces-bottom-left-slider-container">
            <div className="proper-space-slider-wrap">
              {/* Labels above slider */}
              <div className="proper-slider-labels">
                {displaySpaces.map((sp, idx) => {
                  const isSelected = idx === currentSpaceIndex;
                  return (
                    <span
                      key={sp.id}
                      className={`proper-slider-label ${isSelected ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSpace?.(sp.id);
                      }}
                    >
                      {sp.name}
                    </span>
                  );
                })}
              </div>

              {/* Slider Track and Tactile Draggable Thumb */}
              <div
                className="proper-slider-track"
                ref={sliderTrackRef}
                onPointerDown={handleSliderPointerDown}
                onPointerMove={handleSliderPointerMove}
                onPointerUp={handleSliderPointerUp}
              >
                {/* Track Tick Marks */}
                {displaySpaces.map((sp, idx) => {
                  const pct = (idx / (displaySpaces.length - 1)) * 100;
                  return (
                    <div
                      key={sp.id}
                      className="proper-slider-tick"
                      style={{ left: `${pct}%` }}
                    />
                  );
                })}

                {/* Tactile Frosted Slider Handle Thumb */}
                <div
                  className="proper-slider-thumb"
                  style={{
                    left: `${activeRatio * 100}%`,
                  }}
                >
                  <div className="proper-thumb-glow" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {undoToast?.visible && (
        <div className="undo-toast-pill">
          <span>Tab closed</span>
          <button
            className="undo-action-btn"
            onClick={() => {
              onUndoClose?.();
              setUndoToast(null);
            }}
          >
            Undo (Ctrl+Z)
          </button>
        </div>
      )}
    </>
  );
};
