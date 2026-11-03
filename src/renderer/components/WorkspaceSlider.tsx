import React, { useRef, useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Space } from '../types';

interface WorkspaceSliderProps {
  spaces: Space[];
  activeSpaceId: string;
  onSelectSpace: (spaceId: string) => void;
  isCollapsed?: boolean;
}

export const WorkspaceSlider: React.FC<WorkspaceSliderProps> = ({
  spaces,
  activeSpaceId,
  onSelectSpace,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const activeIndex = Math.max(0, spaces.findIndex((s) => s.id === activeSpaceId));
  const total = Math.max(1, spaces.length);
  const activeSpace = spaces[activeIndex] || spaces[0];
  const activeColor = activeSpace?.color || '#7c9cff';

  // Compute percentage (0% to 100%)
  const percentage = total > 1 ? (activeIndex / (total - 1)) * 100 : 50;

  // Update root CSS variable --workspace-accent smoothly
  useEffect(() => {
    document.documentElement.style.setProperty('--workspace-accent', activeColor);
  }, [activeColor]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent | PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = rect.width > 0 ? offsetX / rect.width : 0;
    const targetIndex = Math.round(ratio * (total - 1));
    const boundedIndex = Math.max(0, Math.min(total - 1, targetIndex));
    if (spaces[boundedIndex] && spaces[boundedIndex].id !== activeSpaceId) {
      onSelectSpace(spaces[boundedIndex].id);
    }
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => handlePointerMove(e);
    const onUp = () => setIsDragging(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDragging, spaces, activeSpaceId]);

  // Priority 4: Default state shows only minimal '+' icon
  if (!isOpen) {
    return (
      <div className="spaces-launcher-container">
        <button
          className="spaces-minimal-plus-btn"
          onClick={() => setIsOpen(true)}
          title="Spaces: Click to switch workspaces"
          aria-label="Reveal Spaces"
        >
          <Plus size={15} />
        </button>
      </div>
    );
  }

  // Dynamic track gradient based on active space
  const trackGradient = `linear-gradient(90deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.12) 50%, ${activeColor}40 100%)`;

  return (
    <div
      className="spaces-slider-expanded-panel"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Tooltip on hover or drag displaying mode/space name */}
      {(isHovered || isDragging) && (
        <div
          className="workspace-slider-tooltip"
          style={{
            left: `${percentage}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {activeSpace?.name || 'Space'} ({activeIndex + 1}/{total})
        </div>
      )}

      {/* Slider Track with Snap Ticks & Thumb (Priority 4: 1 slide per Space) */}
      <div
        ref={trackRef}
        className="workspace-slider-track-minimal"
        style={{
          background: trackGradient,
        }}
        onPointerDown={handlePointerDown}
      >
        {/* Tick Marks for Each Snap Point */}
        {spaces.map((space, idx) => {
          const tickPct = total > 1 ? (idx / (total - 1)) * 100 : 50;
          return (
            <div
              key={space.id}
              className="workspace-slider-tick-minimal"
              style={{
                left: `${tickPct}%`,
                opacity: idx === activeIndex ? 0 : 0.5,
              }}
            />
          );
        })}

        {/* Dynamic Color Wash */}
        <div
          className="workspace-slider-fill-minimal"
          style={{
            background: `radial-gradient(circle at ${percentage}% 50%, ${activeColor}60 0%, transparent 70%)`,
          }}
        />

        {/* Thumb Handle */}
        <div
          className="workspace-slider-thumb-minimal"
          style={{
            left: `calc(${percentage}% - 8px)`,
            borderColor: activeColor,
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.6), 0 0 10px ${activeColor}80`,
          }}
        />
      </div>

      {/* Dismiss / Collapse button */}
      <button
        className="spaces-collapse-btn"
        onClick={() => setIsOpen(false)}
        title="Hide Spaces Slider"
        aria-label="Hide Spaces"
      >
        <X size={12} />
      </button>
    </div>
  );
};
