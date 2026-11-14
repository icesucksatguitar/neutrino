import React, { useState, useRef, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  ExternalLink,
  GripHorizontal,
  Video,
  Music,
  Play,
  Pause,
  X,
} from 'lucide-react';
import { ActiveMediaState } from '../types';

interface MediaPlayerProps {
  mediaState: ActiveMediaState | null;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolume: (vol: number) => void;
  onGoToTab: (tabId: string) => void;
  onClose: () => void;
}

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const MediaPlayer: React.FC<MediaPlayerProps> = ({
  mediaState,
  onPlayPause,
  onSeek,
  onVolume,
  onGoToTab,
  onClose,
}) => {
  const [corner, setCorner] = useState<Corner>('bottom-right');
  const [customPos, setCustomPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 330, height: 215 });
  const [isMuted, setIsMuted] = useState(false);
  const prevVolumeRef = useRef(1);

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const playerInitialPosRef = useRef({ x: 0, y: 0 });
  const playerRef = useRef<HTMLDivElement>(null);

  if (!mediaState) return null;

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Dragging to move & snap to corners
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag from header, ignore buttons
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    const rect = playerRef.current?.getBoundingClientRect();
    if (rect) {
      playerInitialPosRef.current = { x: rect.left, y: rect.top };
    }
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      setCustomPos({
        x: playerInitialPosRef.current.x + dx,
        y: playerInitialPosRef.current.y + dy,
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      // Snap to nearest corner
      const midX = window.innerWidth / 2;
      const midY = window.innerHeight / 2;
      const isLeft = e.clientX < midX;
      const isTop = e.clientY < midY;

      if (isLeft && isTop) setCorner('top-left');
      else if (!isLeft && isTop) setCorner('top-right');
      else if (isLeft && !isTop) setCorner('bottom-left');
      else setCorner('bottom-right');

      setCustomPos(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleMuteToggle = () => {
    if (isMuted) {
      setIsMuted(false);
      onVolume(prevVolumeRef.current || 0.8);
    } else {
      prevVolumeRef.current = mediaState.volume;
      setIsMuted(true);
      onVolume(0);
    }
  };

  const handleSafeClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      onClose();
    } catch {}
  };

  const stylePosition: React.CSSProperties = customPos
    ? {
        left: `${customPos.x}px`,
        top: `${customPos.y}px`,
        width: `${size.width}px`,
      }
    : {
        width: `${size.width}px`,
      };

  return (
    <div
      ref={playerRef}
      className={`floating-media-player ${customPos ? '' : corner}`}
      style={stylePosition}
    >
      {/* Draggable Header */}
      <div className="media-player-header" onPointerDown={handlePointerDown}>
        <div className="media-title-group">
          <GripHorizontal size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          {mediaState.hasVideo ? (
            <Video size={13} style={{ color: '#FFFFFF', flexShrink: 0 }} />
          ) : (
            <Music size={13} style={{ color: '#FFFFFF', flexShrink: 0 }} />
          )}
          <span className="media-title" title={mediaState.tabTitle}>
            {mediaState.tabTitle || 'Playing Media'}
          </span>
        </div>

        <div className="media-header-actions" onPointerDown={(e) => e.stopPropagation()}>
          {/* Go back to tab button */}
          <button
            className="media-header-btn"
            onClick={() => onGoToTab(mediaState.tabId)}
            title="Go to Tab"
          >
            <ExternalLink size={13} />
          </button>
          {/* Close mini player (safe modern X icon) */}
          <button
            className="media-header-btn media-close-btn"
            onClick={handleSafeClose}
            title="Dismiss Mini Player"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Video / Graphic Screen */}
      <div className="media-video-container">
        <div className="media-placeholder-graphic">
          {mediaState.hasVideo ? <Video size={28} /> : <Music size={28} />}
          <span>{mediaState.isPlaying ? 'Media Playing in Background' : 'Media Paused'}</span>
        </div>
      </div>

      {/* Controls Body */}
      <div className="media-controls-body">
        {/* Timeline Seekbar */}
        <div className="media-seekbar-row">
          <span className="media-time-text">{formatTime(mediaState.currentTime)}</span>
          <input
            type="range"
            min={0}
            max={mediaState.duration || 100}
            step={0.5}
            value={mediaState.currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="media-seekbar"
          />
          <span className="media-time-text">{formatTime(mediaState.duration)}</span>
        </div>

        {/* Buttons Row: Play/Pause, Volume */}
        <div className="media-buttons-row">
          <button
            className="media-play-pause-btn"
            onClick={onPlayPause}
            title={mediaState.isPlaying ? 'Pause' : 'Play'}
          >
            {mediaState.isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>

          <div className="media-volume-group">
            <button
              onClick={handleMuteToggle}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
            >
              {isMuted || mediaState.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : mediaState.volume}
              onChange={(e) => {
                setIsMuted(false);
                onVolume(parseFloat(e.target.value));
              }}
              className="media-volume-slider"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
