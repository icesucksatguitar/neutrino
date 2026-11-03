import React, { useRef, useState, useEffect } from 'react';
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
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const activeIndex = Math.max(0, spaces.findIndex((s) => s.id === activeSpaceId));
  const total = Math.max(1, spaces.length);
  const activeSpace = spaces[activeIndex] || spaces[0];
  const activeColor = activeSpace?.color || '#2563eb';

  // Compute position percentage for the thumb (0% to 100%)
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

  // Clean dynamic track gradient for dark theme
  const trackGradient =
    total <= 2
      ? `linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0%, ${activeColor}40 100%)`
      : `linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.16) 50%, ${activeColor}60 100%)`;

  return (
    <div
      className="workspace-slider-minimal"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Tooltip on hover or drag displaying mode name (Section 6) */}
      {(isHovered || isDragging) && (
        <div
          className="workspace-slider-tooltip"
          style={{
            left: `${percentage}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {activeSpace?.name || 'Default'}
        </div>
      )}

      {/* Slider Track with Snap Ticks & Thumb (No text labels, Section 5) */}
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
                opacity: idx === activeIndex ? 0 : 0.6,
              }}
            />
          );
        })}

        {/* Dynamic Color Wash */}
        <div
          className="workspace-slider-fill-minimal"
          style={{
            background: `radial-gradient(circle at ${percentage}% 50%, ${activeColor}80 0%, transparent 70%)`,
          }}
        />

        {/* Thumb */}
        <div
          className="workspace-slider-thumb-minimal"
          style={{
            left: `calc(${percentage}% - 8px)`,
            boxShadow: `0 2px 6px rgba(15, 23, 42, 0.2), 0 0 8px ${activeColor}`,
          }}
        />
      </div>
    </div>
  );
};
