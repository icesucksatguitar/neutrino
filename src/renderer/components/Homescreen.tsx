import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { Space } from '../types';
import { WorkspaceSlider } from './WorkspaceSlider';

interface HomescreenProps {
  spaces?: Space[];
  activeSpaceId?: string;
  onSelectSpace?: (spaceId: string) => void;
  onNavigate: (url: string) => void;
}

// Cloud shapes for 2 parallax layers (thin line art)
const CLOUD_SHAPES_FAR = [
  [
    '      . - - - .      ',
    '    (           )    ',
    '  (               )  ',
    '    \' - - - - - \'    ',
  ],
  [
    '       . - - - - .       ',
    '    (             )      ',
    '  (                 )    ',
    '    \' - - - - - - \'      ',
  ],
];

const CLOUD_SHAPES_NEAR = [
  [
    '        _ . - - - . _        ',
    '    . \'               \' .    ',
    '  (                       )  ',
    '    \' - . _ _ _ _ _ . - \'    ',
  ],
  [
    '      _ . - - - - - . _      ',
    '   . \'                 \' .   ',
    ' (                         ) ',
    '   \' - - . _ _ _ . - - \'     ',
  ],
  [
    '     . - - - - - .     ',
    '   (               )   ',
    ' (                   ) ',
    '   \' - - - - - - - \'   ',
  ],
];

export const Homescreen: React.FC<HomescreenProps> = ({
  spaces = [],
  activeSpaceId = '',
  onSelectSpace,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [frame, setFrame] = useState(0);
  const [isWindowFocused, setIsWindowFocused] = useState(true);

  // Dynamic grid metrics based on window dimensions (Section 4)
  const [gridSize, setGridSize] = useState(() => ({
    cols: Math.max(60, Math.floor(window.innerWidth / 7.2)),
    rows: Math.max(25, Math.floor(window.innerHeight / 14)),
  }));

  // Debounced window resize handler
  useEffect(() => {
    let timeoutId: any;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setGridSize({
          cols: Math.max(60, Math.floor(window.innerWidth / 7.2)),
          rows: Math.max(25, Math.floor(window.innerHeight / 14)),
        });
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Pause animation when window is blurred or hidden (Section 4)
  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);
    const handleVisibility = () => setIsWindowFocused(!document.hidden);

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Autofocus search input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    let target = trimmed;
    if (target.startsWith('localhost') || target.startsWith('127.0.0.1')) {
      target = 'http://' + target;
    } else if (!target.includes('://')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = 'https://' + target;
      } else {
        target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      }
    }

    onNavigate(target);
  };

  // 5.5 FPS subtle animation (~180ms), respects prefers-reduced-motion (Section 4)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    if (!isWindowFocused) return;

    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % 100000);
    }, 180);

    return () => clearInterval(interval);
  }, [isWindowFocused]);

  // Generate ASCII clouds and jet dynamically covering entire window (Section 4)
  const asciiBackground = useMemo(() => {
    const { cols, rows } = gridSize;
    const grid: string[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ' ')
    );

    const drawStr = (x: number, y: number, text: string) => {
      const iy = Math.floor(y);
      if (iy < 0 || iy >= rows) return;
      for (let i = 0; i < text.length; i++) {
        const ix = Math.floor(x + i);
        if (ix >= 0 && ix < cols && text[i] !== ' ') {
          grid[iy][ix] = text[i];
        }
      }
    };

    const drawShape = (startX: number, startY: number, shape: string[]) => {
      for (let r = 0; r < shape.length; r++) {
        drawStr(startX, startY + r, shape[r]);
      }
    };

    // Parallax Layer 1: High, far altitude clouds (drift ~0.05 chars/frame)
    const farOffset = frame * 0.05;
    const farCloud1X = (Math.floor(farOffset) % (cols + 40)) - 30;
    const farCloud1Y = Math.floor(rows * 0.08);
    drawShape(farCloud1X, farCloud1Y, CLOUD_SHAPES_FAR[0]);

    const farCloud2X = (Math.floor(farOffset + cols * 0.55) % (cols + 40)) - 30;
    const farCloud2Y = Math.floor(rows * 0.16);
    drawShape(farCloud2X, farCloud2Y, CLOUD_SHAPES_FAR[1]);

    // Parallax Layer 2: Near, mid/lower altitude clouds (drift ~0.11 chars/frame)
    const nearOffset = frame * 0.11;
    const nearCloud1X = (Math.floor(nearOffset + 15) % (cols + 50)) - 40;
    const nearCloud1Y = Math.floor(rows * 0.38);
    drawShape(nearCloud1X, nearCloud1Y, CLOUD_SHAPES_NEAR[0]);

    const nearCloud2X = (Math.floor(nearOffset + cols * 0.6) % (cols + 50)) - 40;
    const nearCloud2Y = Math.floor(rows * 0.58);
    drawShape(nearCloud2X, nearCloud2Y, CLOUD_SHAPES_NEAR[1]);

    const nearCloud3X = (Math.floor(nearOffset + cols * 0.25) % (cols + 50)) - 40;
    const nearCloud3Y = Math.floor(rows * 0.78);
    drawShape(nearCloud3X, nearCloud3Y, CLOUD_SHAPES_NEAR[2]);

    // The Jet & Contrail (Section 4: moves slowly across sky, leaves fading contrail)
    const jetSpeed = 0.28;
    const jetX = Math.floor((frame * jetSpeed) % (cols + 60)) - 45;
    const jetY = Math.floor(rows * 0.25);

    // Contrail trailing behind jet (gradually fades out)
    const trailLength = Math.min(32, Math.floor(cols * 0.3));
    for (let t = 1; t <= trailLength; t++) {
      const tx = jetX - t;
      if (tx >= 0 && tx < cols && jetY >= 0 && jetY < rows) {
        if (t < 6) {
          grid[jetY][tx] = '=';
        } else if (t < 14) {
          grid[jetY][tx] = (t % 2 === 0) ? '-' : ' ';
        } else if (t < 24) {
          grid[jetY][tx] = (t % 3 === 0) ? '.' : ' ';
        } else {
          grid[jetY][tx] = (t % 5 === 0) ? '~' : ' ';
        }
      }
    }

    // Small minimal jet silhouette
    drawStr(jetX, jetY - 1, '     _|_     ');
    drawStr(jetX, jetY,     ' ---=(o)=--->');
    drawStr(jetX, jetY + 1, '     \' \'     ');

    return grid.map((r) => r.join('')).join('\n');
  }, [gridSize, frame]);

  return (
    <>
      {/* Section 4: Full-window ASCII background (Behind toolbar and all UI, never blocks clicks) */}
      <div className="homescreen-ascii-fixed-bg" aria-hidden="true">
        <pre className="ascii-clouds-jet-pre">{asciiBackground}</pre>
      </div>

      {/* Section 5: Glassmorphic URL Bar and Wordmark (Center of screen) */}
      <div className="homescreen-glass-container">
        <div className="homescreen-center-content">
          <h1 className="homescreen-wordmark">Neutrino</h1>

          <form className="homescreen-glass-search-box" onSubmit={handleSubmit}>
            <Search size={18} className="homescreen-glass-icon" />
            <input
              ref={inputRef}
              type="text"
              className="homescreen-glass-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Google or enter URL..."
              spellCheck={false}
              autoComplete="off"
            />
            {query.trim().length > 0 && (
              <button
                type="submit"
                className="homescreen-glass-submit-btn"
                title="Navigate (Enter)"
              >
                <ArrowRight size={15} />
              </button>
            )}
          </form>
        </div>

        {/* Section 6: Mode Slider (Bottom-left corner, no labels, hover tooltip) */}
        {spaces.length > 0 && onSelectSpace && (
          <div className="homescreen-bottom-left-slider">
            <WorkspaceSlider
              spaces={spaces}
              activeSpaceId={activeSpaceId}
              onSelectSpace={onSelectSpace}
            />
          </div>
        )}
      </div>
    </>
  );
};
