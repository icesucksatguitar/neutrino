import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PixelSearch, PixelForward } from './PixelIcons';
import { Space } from '../types';
import { WorkspaceSlider } from './WorkspaceSlider';

interface HomescreenProps {
  spaces?: Space[];
  activeSpaceId?: string;
  isDarkMode?: boolean;
  isSidebarOpen?: boolean;
  onSelectSpace?: (spaceId: string) => void;
  onNavigate: (url: string) => void;
}

interface Particle {
  x: number;
  y: number;
  speed: number;
  swaySpeed: number;
  swayAmp: number;
  phase: number;
  char: string;
  color: string;
}

// Sumi-e Black Leaf Characters & Palette for Light Mode
const SUMIE_LEAF_CHARS = ['*', 'o', ')', '(', '~', '.', ',', '^'];
const SUMIE_LEAF_COLORS = ['#111111', '#1c1c1c', '#282828', '#383838', '#4a4a4a', '#5c5c5c'];

// Milky Way Cosmic Dust Characters & Palette for Dark Mode
const COSMIC_DUST_CHARS = ['*', '+', '.', 'o', '~', '°', '^', "'"];
const COSMIC_DUST_COLORS = ['#ffffff', '#e0f2fe', '#7dd3fc', '#38bdf8', '#c084fc', '#a855f7', '#fde047', '#f472b6'];

export const Homescreen: React.FC<HomescreenProps> = ({
  spaces = [],
  activeSpaceId = '',
  isDarkMode = false,
  isSidebarOpen = true,
  onSelectSpace,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const dimensionsRef = useRef<{ width: number; height: number; cols: number; rows: number }>({
    width: 0,
    height: 0,
    cols: 0,
    rows: 0,
  });
  const [isWindowFocused, setIsWindowFocused] = useState(true);

  const charW = 8;
  const charH = 14;

  // Window focus & visibility detection
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

  // Listen for search triggers (+ New Tab button or Ctrl+T / Ctrl+K)
  useEffect(() => {
    const handleShowSearch = () => {
      setIsSearchVisible(true);
      setTimeout(() => inputRef.current?.focus(), 60);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setIsSearchVisible(true);
        setTimeout(() => inputRef.current?.focus(), 60);
      } else if (e.key === 'Escape') {
        setIsSearchVisible(false);
      }
    };

    window.addEventListener('neutrino:show-search', handleShowSearch);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('neutrino:show-search', handleShowSearch);
      window.removeEventListener('keydown', handleKeyDown);
    };
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

  // Build static canvas: Single Sumi-e Black Tree (Light Mode) OR Milky Way Galaxy (Dark Mode)
  const buildStaticCanopy = useCallback((cols: number, rows: number, width: number, height: number, darkMode: boolean) => {
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d', { alpha: false });
    if (!ctx) return offscreen;

    if (darkMode) {
      // =========================================================================
      // DARK MODE: MILKY WAY GALAXY ASCII ART
      // =========================================================================
      ctx.fillStyle = '#07080d';
      ctx.fillRect(0, 0, width, height);

      ctx.font = 'bold 13px "Pixelify Sans", "Courier New", monospace';
      ctx.textBaseline = 'top';

      const grid: ({ char: string; color: string } | null)[][] =
        Array.from({ length: rows }, () => Array(cols).fill(null));

      const cx = width * 0.50;
      const cy = height * 0.44;

      // 1. Distant Starfield & Interstellar Dust
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          if (Math.random() < 0.055) {
            const starChars = ['.', ',', "'", '`', '~', '*', '+', '^'];
            const starColors = ['#2d3748', '#4a5568', '#718096', '#a0aec0', '#cbd5e0', '#818cf8', '#38bdf8'];
            grid[gy][gx] = {
              char: starChars[Math.floor(Math.random() * starChars.length)],
              color: starColors[Math.floor(Math.random() * starColors.length)],
            };
          }
        }
      }

      // 2. Galactic Core (Dense, radiant center of the Milky Way)
      const coreRx = width * 0.22;
      const coreRy = height * 0.16;
      const minCoreGy = Math.max(0, Math.floor((cy - coreRy * 1.5) / charH));
      const maxCoreGy = Math.min(rows - 1, Math.ceil((cy + coreRy * 1.5) / charH));
      const minCoreGx = Math.max(0, Math.floor((cx - coreRx * 1.5) / charW));
      const maxCoreGx = Math.min(cols - 1, Math.ceil((cx + coreRx * 1.5) / charW));

      for (let gy = minCoreGy; gy <= maxCoreGy; gy++) {
        for (let gx = minCoreGx; gx <= maxCoreGx; gx++) {
          const px = gx * charW + charW / 2;
          const py = gy * charH + charH / 2;
          const dx = px - cx;
          const dy = py - cy;
          const normDist = Math.sqrt((dx * dx) / (coreRx * coreRx) + (dy * dy) / (coreRy * coreRy));

          if (normDist <= 1.0 && Math.random() < Math.pow(1 - normDist * 0.75, 1.8)) {
            let char: string;
            let color: string;
            if (normDist < 0.22) {
              const cChars = ['@', '8', 'O', '0', '%', '#'];
              const cColors = ['#ffffff', '#ffffff', '#fef08a', '#fde047', '#fef9c3'];
              char = cChars[Math.floor(Math.random() * cChars.length)];
              color = cColors[Math.floor(Math.random() * cColors.length)];
            } else if (normDist < 0.60) {
              const mChars = ['*', 'o', '8', '0', 'O', '+', '%'];
              const mColors = ['#e0f2fe', '#7dd3fc', '#38bdf8', '#c084fc', '#a855f7'];
              char = mChars[Math.floor(Math.random() * mChars.length)];
              color = mColors[Math.floor(Math.random() * mColors.length)];
            } else {
              const oChars = ['*', '+', 'x', '~', '.', 'o'];
              const oColors = ['#818cf8', '#6366f1', '#4f46e5', '#38bdf8', '#0284c7'];
              char = oChars[Math.floor(Math.random() * oChars.length)];
              color = oColors[Math.floor(Math.random() * oColors.length)];
            }
            grid[gy][gx] = { char, color };
          }
        }
      }

      // 3. Four Spiral Arms of the Milky Way
      const armConfigs = [
        { startTheta: 0, maxTheta: 3.8 * Math.PI, a: 18, b: 0.28, widthMultiplier: 28, armColor: '#38bdf8' },
        { startTheta: Math.PI, maxTheta: 4.8 * Math.PI, a: 18, b: 0.28, widthMultiplier: 28, armColor: '#c084fc' },
        { startTheta: 0.5 * Math.PI, maxTheta: 3.2 * Math.PI, a: 22, b: 0.26, widthMultiplier: 22, armColor: '#818cf8' },
        { startTheta: 1.5 * Math.PI, maxTheta: 4.2 * Math.PI, a: 22, b: 0.26, widthMultiplier: 22, armColor: '#ec4899' },
      ];

      const tiltAngle = -0.42; // ~24° inclination of galactic plane
      const cosTilt = Math.cos(tiltAngle);
      const sinTilt = Math.sin(tiltAngle);
      const yAspect = 0.55;

      for (const arm of armConfigs) {
        const steps = 400;
        for (let i = 0; i < steps; i++) {
          const theta = arm.startTheta + (arm.maxTheta - arm.startTheta) * (i / steps);
          const r = arm.a * Math.exp(arm.b * (theta - arm.startTheta));

          const discX = r * Math.cos(theta);
          const discY = r * Math.sin(theta) * yAspect;

          const armX = cx + (discX * cosTilt - discY * sinTilt);
          const armY = cy + (discX * sinTilt + discY * cosTilt);

          const armThickness = 12 + (r / 25) * arm.widthMultiplier * 0.08;
          const starCount = Math.floor(armThickness * 1.8);

          for (let s = 0; s < starCount; s++) {
            const spreadR = (Math.random() - 0.5) * armThickness * 2;
            const spreadAngle = Math.random() * Math.PI * 2;
            const px = armX + Math.cos(spreadAngle) * spreadR;
            const py = armY + Math.sin(spreadAngle) * spreadR * yAspect;

            const gx = Math.floor(px / charW);
            const gy = Math.floor(py / charH);

            if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
              const distFromArmCenter = Math.abs(spreadR) / armThickness;
              let char: string;
              let color: string;
              if (distFromArmCenter < 0.35) {
                const coreArmChars = ['*', 'o', '8', '@', 'O', '+'];
                const coreArmColors = ['#ffffff', '#f0f9ff', '#e0f2fe', arm.armColor, '#f472b6'];
                char = coreArmChars[Math.floor(Math.random() * coreArmChars.length)];
                color = coreArmColors[Math.floor(Math.random() * coreArmColors.length)];
              } else if (distFromArmCenter < 0.75) {
                const midArmChars = ['*', '+', 'x', '~', 'o', '.'];
                const midArmColors = [arm.armColor, '#818cf8', '#6366f1', '#a855f7', '#38bdf8'];
                char = midArmChars[Math.floor(Math.random() * midArmChars.length)];
                color = midArmColors[Math.floor(Math.random() * midArmColors.length)];
              } else {
                const outerChars = ['.', ',', '~', '^', "'"];
                const outerColors = ['#475569', '#64748b', '#334155', '#4338ca'];
                char = outerChars[Math.floor(Math.random() * outerChars.length)];
                color = outerColors[Math.floor(Math.random() * outerColors.length)];
              }
              grid[gy][gx] = { char, color };
            }
          }
        }
      }

      // Render galaxy grid to canvas
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const cell = grid[gy][gx];
          if (cell) {
            ctx.fillStyle = cell.color;
            ctx.fillText(cell.char, gx * charW, gy * charH);
          }
        }
      }

      return offscreen;
    }

    // =========================================================================
    // LIGHT MODE: JAPANESE SUMI-E INK BLACK TREE
    // =========================================================================
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.font = 'bold 13px "Pixelify Sans", "Courier New", monospace';
    ctx.textBaseline = 'top';

    const grid: ({ char: string; color: string; type: 'branch' | 'blossom' | 'ground' } | null)[][] =
      Array.from({ length: rows }, () => Array(cols).fill(null));

    // Helper: draw thick branch line using pixel coordinates
    const drawBranchPx = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      thicknessPx: number,
      color: string
    ) => {
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.floor(dist / 3));
      const rad = thicknessPx / 2;

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const curX = x0 + (x1 - x0) * t;
        const curY = y0 + (y1 - y0) * t;

        const minGx = Math.max(0, Math.floor((curX - rad) / charW));
        const maxGx = Math.min(cols - 1, Math.ceil((curX + rad) / charW));
        const minGy = Math.max(0, Math.floor((curY - rad) / charH));
        const maxGy = Math.min(rows - 1, Math.ceil((curY + rad) / charH));

        for (let gy = minGy; gy <= maxGy; gy++) {
          for (let gx = minGx; gx <= maxGx; gx++) {
            const px = gx * charW + charW / 2;
            const py = gy * charH + charH / 2;
            const d = Math.hypot(px - curX, py - curY);
            if (d <= rad) {
              const bChars = ['#', '%', '&', '8', 'M', 'W', '@', '='];
              grid[gy][gx] = {
                char: bChars[Math.floor(Math.random() * bChars.length)],
                color: color,
                type: 'branch',
              };
            }
          }
        }
      }
    };

    const centerX = width * 0.50;
    const groundY = height * 0.86;
    const trunkHeight = height * 0.20;
    const forkX = centerX;
    const forkY = groundY - trunkHeight;

    const canopyCenterX = centerX;
    const canopyCenterY = height * 0.35;
    const canopyRx = width * 0.34;
    const canopyRy = height * 0.26;

    // 1. Draw Sumi-e Ground Meadow in subtle ink wash
    const groundGyStart = Math.floor(groundY / charH);
    for (let gy = groundGyStart; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const px = gx * charW;
        const py = gy * charH;
        const distFromCenter = Math.abs(px - centerX);
        const moundRise = Math.max(0, (1 - Math.pow(distFromCenter / (width * 0.48), 2)) * 16);
        if (py >= groundY - moundRise) {
          const gChars = ['.', ',', '~', '-', '=', '^', '*'];
          const gColors = ['#aaaaaa', '#888888', '#666666', '#555555', '#bbbbbb', '#777777'];
          grid[gy][gx] = {
            char: gChars[Math.floor(Math.random() * gChars.length)],
            color: gColors[Math.floor(Math.random() * gColors.length)],
            type: 'ground',
          };
        }
      }
    }

    // 2. Solid Black Trunk & Branch Framework
    const branches = [
      // Flared trunk roots
      { x0: centerX - 28, y0: groundY + 16, x1: centerX - 8, y1: groundY - 12, w: 24, c: '#080808' },
      { x0: centerX + 28, y0: groundY + 16, x1: centerX + 8, y1: groundY - 12, w: 24, c: '#080808' },
      { x0: centerX - 14, y0: groundY + 8, x1: centerX - 4, y1: forkY, w: 26, c: '#0f0f0f' },
      { x0: centerX + 14, y0: groundY + 8, x1: centerX + 4, y1: forkY, w: 26, c: '#0f0f0f' },
      { x0: centerX, y0: groundY, x1: centerX, y1: forkY, w: 30, c: '#0d0d0d' },

      // Main limbs fanning out visibly from fork (Solid deep black ink)
      // Far left
      { x0: forkX, y0: forkY, x1: forkX - canopyRx * 0.38, y1: forkY - 40, w: 16, c: '#141414' },
      { x0: forkX - canopyRx * 0.38, y0: forkY - 40, x1: forkX - canopyRx * 0.70, y1: forkY - 65, w: 11, c: '#1c1c1c' },
      { x0: forkX - canopyRx * 0.70, y0: forkY - 65, x1: forkX - canopyRx * 0.92, y1: forkY - 45, w: 6, c: '#242424' },
      { x0: forkX - canopyRx * 0.70, y0: forkY - 65, x1: forkX - canopyRx * 0.85, y1: forkY - 100, w: 5, c: '#242424' },

      // Mid left
      { x0: forkX, y0: forkY, x1: forkX - canopyRx * 0.22, y1: forkY - 55, w: 15, c: '#141414' },
      { x0: forkX - canopyRx * 0.22, y0: forkY - 55, x1: forkX - canopyRx * 0.45, y1: forkY - 130, w: 10, c: '#1c1c1c' },
      { x0: forkX - canopyRx * 0.45, y0: forkY - 130, x1: forkX - canopyRx * 0.65, y1: forkY - 190, w: 6, c: '#242424' },
      { x0: forkX - canopyRx * 0.45, y0: forkY - 130, x1: forkX - canopyRx * 0.35, y1: forkY - 210, w: 5, c: '#242424' },

      // Upright center-left
      { x0: forkX, y0: forkY, x1: forkX - 12, y1: forkY - 70, w: 14, c: '#141414' },
      { x0: forkX - 12, y0: forkY - 70, x1: forkX - 25, y1: forkY - 160, w: 9, c: '#1c1c1c' },
      { x0: forkX - 25, y0: forkY - 160, x1: forkX - 15, y1: forkY - 240, w: 5, c: '#242424' },

      // Upright center-right
      { x0: forkX, y0: forkY, x1: forkX + 12, y1: forkY - 70, w: 14, c: '#141414' },
      { x0: forkX + 12, y0: forkY - 70, x1: forkX + 25, y1: forkY - 160, w: 9, c: '#1c1c1c' },
      { x0: forkX + 25, y0: forkY - 160, x1: forkX + 15, y1: forkY - 240, w: 5, c: '#242424' },

      // Mid right
      { x0: forkX, y0: forkY, x1: forkX + canopyRx * 0.22, y1: forkY - 55, w: 15, c: '#141414' },
      { x0: forkX + canopyRx * 0.22, y0: forkY - 55, x1: forkX + canopyRx * 0.45, y1: forkY - 130, w: 10, c: '#1c1c1c' },
      { x0: forkX + canopyRx * 0.45, y0: forkY - 130, x1: forkX + canopyRx * 0.65, y1: forkY - 190, w: 6, c: '#242424' },
      { x0: forkX + canopyRx * 0.45, y0: forkY - 130, x1: forkX + canopyRx * 0.35, y1: forkY - 210, w: 5, c: '#242424' },

      // Far right
      { x0: forkX, y0: forkY, x1: forkX + canopyRx * 0.38, y1: forkY - 40, w: 16, c: '#141414' },
      { x0: forkX + canopyRx * 0.38, y0: forkY - 40, x1: forkX + canopyRx * 0.70, y1: forkY - 65, w: 11, c: '#1c1c1c' },
      { x0: forkX + canopyRx * 0.70, y0: forkY - 65, x1: forkX + canopyRx * 0.92, y1: forkY - 45, w: 6, c: '#242424' },
      { x0: forkX + canopyRx * 0.70, y0: forkY - 65, x1: forkX + canopyRx * 0.85, y1: forkY - 100, w: 5, c: '#242424' },
    ];

    for (const b of branches) {
      drawBranchPx(b.x0, b.y0, b.x1, b.y1, b.w, b.c);
    }

    // 3. Dense Sumi-e Black Canopy Dome
    const puffs = [
      { cx: canopyCenterX, cy: canopyCenterY - canopyRy * 0.30, rx: canopyRx * 0.92, ry: canopyRy * 0.72 },
      { cx: canopyCenterX, cy: canopyCenterY - canopyRy * 0.55, rx: canopyRx * 0.82, ry: canopyRy * 0.52 },
      { cx: canopyCenterX - canopyRx * 0.32, cy: canopyCenterY - canopyRy * 0.55, rx: canopyRx * 0.58, ry: canopyRy * 0.48 },
      { cx: canopyCenterX + canopyRx * 0.32, cy: canopyCenterY - canopyRy * 0.55, rx: canopyRx * 0.58, ry: canopyRy * 0.48 },

      { cx: canopyCenterX - canopyRx * 0.58, cy: canopyCenterY - canopyRy * 0.10, rx: canopyRx * 0.48, ry: canopyRy * 0.65 },
      { cx: canopyCenterX - canopyRx * 0.76, cy: canopyCenterY + canopyRy * 0.10, rx: canopyRx * 0.36, ry: canopyRy * 0.55 },
      { cx: canopyCenterX - canopyRx * 0.88, cy: canopyCenterY + canopyRy * 0.26, rx: canopyRx * 0.25, ry: canopyRy * 0.42 },

      { cx: canopyCenterX + canopyRx * 0.58, cy: canopyCenterY - canopyRy * 0.10, rx: canopyRx * 0.48, ry: canopyRy * 0.65 },
      { cx: canopyCenterX + canopyRx * 0.76, cy: canopyCenterY + canopyRy * 0.10, rx: canopyRx * 0.36, ry: canopyRy * 0.55 },
      { cx: canopyCenterX + canopyRx * 0.88, cy: canopyCenterY + canopyRy * 0.26, rx: canopyRx * 0.25, ry: canopyRy * 0.42 },

      { cx: canopyCenterX - canopyRx * 0.30, cy: canopyCenterY + canopyRy * 0.32, rx: canopyRx * 0.48, ry: canopyRy * 0.46 },
      { cx: canopyCenterX + canopyRx * 0.30, cy: canopyCenterY + canopyRy * 0.32, rx: canopyRx * 0.48, ry: canopyRy * 0.46 },
      { cx: canopyCenterX, cy: canopyCenterY + canopyRy * 0.28, rx: canopyRx * 0.68, ry: canopyRy * 0.50 },
    ];

    const minCanopyGy = Math.max(0, Math.floor((canopyCenterY - canopyRy * 1.30) / charH));
    const maxCanopyGy = Math.min(rows - 1, Math.ceil((canopyCenterY + canopyRy * 1.25) / charH));
    const minCanopyGx = Math.max(0, Math.floor((canopyCenterX - canopyRx * 1.30) / charW));
    const maxCanopyGx = Math.min(cols - 1, Math.ceil((canopyCenterX + canopyRx * 1.30) / charW));

    for (let gy = minCanopyGy; gy <= maxCanopyGy; gy++) {
      for (let gx = minCanopyGx; gx <= maxCanopyGx; gx++) {
        const px = gx * charW + charW / 2;
        const py = gy * charH + charH / 2;

        let minNormDist = 999;
        for (const p of puffs) {
          const dx = px - p.cx;
          const dy = py - p.cy;
          const normDist = Math.sqrt((dx * dx) / (p.rx * p.rx) + (dy * dy) / (p.ry * p.ry));
          if (normDist < minNormDist) minNormDist = normDist;
        }

        if (minNormDist <= 1.05) {
          const edgeFalloff = minNormDist > 0.88 ? (1.05 - minNormDist) / 0.17 : 1.0;
          const prob = 0.98 * edgeFalloff;

          if (Math.random() < prob) {
            const existing = grid[gy][gx];
            const isBranch = existing && existing.type === 'branch';

            if (isBranch && Math.random() < 0.70) continue;

            const heightNorm = (py - (canopyCenterY - canopyRy)) / (canopyRy * 2);
            const depthFactor = minNormDist;

            let char: string;
            let color: string;
            if (depthFactor > 0.90 || heightNorm < 0.12) {
              // Outer fringe sumi-e ink wash
              const fringeChars = ['*', 'o', 'c', '(', ')', '~', '.', '^', '+'];
              const fringeColors = ['#444444', '#555555', '#666666', '#3b3b3b', '#777777'];
              char = fringeChars[Math.floor(Math.random() * fringeChars.length)];
              color = fringeColors[Math.floor(Math.random() * fringeColors.length)];
            } else if (heightNorm > 0.65 && depthFactor < 0.65) {
              // Deep interior shadow (Solid Charcoal / Black Ink)
              const shadowChars = ['@', '#', '%', '&', '8', 'M', 'W'];
              const shadowColors = ['#080808', '#101010', '#161616', '#1c1c1c', '#222222'];
              char = shadowChars[Math.floor(Math.random() * shadowChars.length)];
              color = shadowColors[Math.floor(Math.random() * shadowColors.length)];
            } else {
              // Dense Black Ink Body
              const midChars = ['@', '%', '&', '8', 'M', 'W', 'O', '0', 'Q', 'B', '*'];
              const midColors = ['#111111', '#181818', '#202020', '#2a2a2a', '#323232', '#141414'];
              char = midChars[Math.floor(Math.random() * midChars.length)];
              color = midColors[Math.floor(Math.random() * midColors.length)];
            }

            grid[gy][gx] = { char, color, type: 'blossom' };
          }
        }
      }
    }

    // Render tree grid to offscreen canvas
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = grid[y][x];
        if (cell) {
          ctx.fillStyle = cell.color;
          ctx.fillText(cell.char, x * charW, y * charH);
        }
      }
    }

    return offscreen;
  }, [charW, charH]);

  // Setup Canvas, handle resize and animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    let cols = Math.ceil(width / charW) + 2;
    let rows = Math.ceil(height / charH) + 2;

    dimensionsRef.current = { width, height, cols, rows };

    // Build static canvas based on current dark/light mode
    offscreenCanvasRef.current = buildStaticCanopy(cols, rows, width, height, isDarkMode);

    document.fonts.ready.then(() => {
      offscreenCanvasRef.current = buildStaticCanopy(cols, rows, width, height, isDarkMode);
    });

    // Initialize particles:
    // In Dark Mode: Cosmic stardust drifting across the galaxy
    // In Light Mode: Falling black sumi-e leaves drifting from the tree
    const particleCount = isDarkMode
      ? Math.max(90, Math.floor((cols * rows) / 95))
      : Math.max(85, Math.floor((cols * rows) / 100));

    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: isDarkMode ? Math.random() * cols : cols * 0.18 + Math.random() * (cols * 0.64),
      y: Math.random() * rows,
      speed: isDarkMode ? 0.08 + Math.random() * 0.18 : 0.14 + Math.random() * 0.24,
      swaySpeed: isDarkMode ? 0.05 + Math.random() * 0.09 : 0.08 + Math.random() * 0.12,
      swayAmp: isDarkMode ? 0.4 + Math.random() * 0.8 : 0.7 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      char: isDarkMode
        ? COSMIC_DUST_CHARS[Math.floor(Math.random() * COSMIC_DUST_CHARS.length)]
        : SUMIE_LEAF_CHARS[Math.floor(Math.random() * SUMIE_LEAF_CHARS.length)],
      color: isDarkMode
        ? COSMIC_DUST_COLORS[Math.floor(Math.random() * COSMIC_DUST_COLORS.length)]
        : SUMIE_LEAF_COLORS[Math.floor(Math.random() * SUMIE_LEAF_COLORS.length)],
    }));

    // Debounced resize handler
    let resizeTimer: any;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        cols = Math.ceil(width / charW) + 2;
        rows = Math.ceil(height / charH) + 2;
        dimensionsRef.current = { width, height, cols, rows };
        offscreenCanvasRef.current = buildStaticCanopy(cols, rows, width, height, isDarkMode);
      }, 120);
    };

    window.addEventListener('resize', handleResize);

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stepInterval = 135; // ~7.4 FPS stepped cozy animation

    const drawCanvas = () => {
      if (offscreenCanvasRef.current) {
        ctx.drawImage(offscreenCanvasRef.current, 0, 0);
      }

      // Draw drifting particles with pixel font
      ctx.font = 'bold 13px "Pixelify Sans", "Courier New", monospace';
      ctx.textBaseline = 'top';
      for (const p of particlesRef.current) {
        ctx.fillStyle = p.color;
        const px = Math.round(p.x) * charW;
        const py = Math.round(p.y) * charH;
        ctx.fillText(p.char, px, py);
      }
    };

    // Draw initial frame
    drawCanvas();

    document.fonts.ready.then(() => {
      offscreenCanvasRef.current = buildStaticCanopy(cols, rows, width, height, isDarkMode);
      drawCanvas();
    });

    // Particle step animation tick
    const intervalId = setInterval(() => {
      const shouldAnimate = !mediaQuery.matches && isWindowFocused;
      if (shouldAnimate) {
        const currentRows = dimensionsRef.current.rows;
        const currentCols = dimensionsRef.current.cols;

        for (const p of particlesRef.current) {
          p.y += p.speed;
          p.x += Math.sin(p.y * p.swaySpeed + p.phase) * p.swayAmp;

          // Wrap particles when reaching bottom
          if (p.y > currentRows + 1) {
            p.y = -1;
            p.x = isDarkMode
              ? Math.random() * currentCols
              : currentCols * 0.18 + Math.random() * (currentCols * 0.64);
          }
        }
      }
      drawCanvas();
    }, stepInterval);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
      clearInterval(intervalId);
    };
  }, [buildStaticCanopy, charW, charH, isWindowFocused, isDarkMode]);

  return (
    <div className="homepage-hero-canvas">
      {/* 1. Full-window ASCII Canvas: Sumi-e Black Tree (Light) or Milky Way (Dark) */}
      <canvas
        ref={canvasRef}
        className="homescreen-ascii-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
        aria-hidden="true"
      />

      {/* 2. Search Bar: Hidden initially; appears when '+ New Tab' or Ctrl+T / Ctrl+K is triggered */}
      {isSearchVisible && (
        <div className="homescreen-center-content visible">
          <div className="homescreen-search-blur-ambient">
            <form className="homescreen-glass-search-box" onSubmit={handleSubmit}>
              <PixelSearch size={16} className="homescreen-glass-icon" />
              <input
                ref={inputRef}
                type="text"
                className="homescreen-glass-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search or enter URL..."
                spellCheck={false}
                autoComplete="off"
              />
              {query.trim().length > 0 && (
                <button
                  type="submit"
                  className="homescreen-glass-submit-btn"
                  title="Navigate (Enter)"
                  aria-label="Submit"
                >
                  <PixelForward size={14} />
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* 3. Bottom-left: Mode slider, rendered only when sidebar is collapsed to avoid collision */}
      {!isSidebarOpen && spaces.length > 0 && onSelectSpace && (
        <div className="homescreen-bottom-left-slider">
          <WorkspaceSlider
            spaces={spaces}
            activeSpaceId={activeSpaceId}
            onSelectSpace={onSelectSpace}
          />
        </div>
      )}
    </div>
  );
};
