import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
  color?: string;
}

// Common pixel-art styles
const pixelSvgStyle: React.CSSProperties = {
  imageRendering: 'pixelated',
  display: 'inline-block',
  verticalAlign: 'middle',
  flexShrink: 0,
};

// 1. Pixel Back Arrow (16x16)
export const PixelBack: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Outline */}
    <rect x="6" y="2" width="2" height="1" fill="#452433" />
    <rect x="4" y="3" width="2" height="1" fill="#452433" />
    <rect x="2" y="4" width="2" height="1" fill="#452433" />
    <rect x="1" y="5" width="2" height="2" fill="#452433" />
    <rect x="0" y="7" width="2" height="2" fill="#452433" />
    <rect x="1" y="9" width="2" height="2" fill="#452433" />
    <rect x="2" y="11" width="2" height="1" fill="#452433" />
    <rect x="4" y="12" width="2" height="1" fill="#452433" />
    <rect x="6" y="13" width="2" height="1" fill="#452433" />
    <rect x="8" y="12" width="1" height="1" fill="#452433" />
    <rect x="8" y="3" width="1" height="1" fill="#452433" />
    {/* Shaft outline */}
    <rect x="7" y="6" width="8" height="1" fill="#452433" />
    <rect x="7" y="9" width="8" height="1" fill="#452433" />
    <rect x="14" y="7" width="1" height="2" fill="#452433" />
    {/* Fill */}
    <rect x="6" y="3" width="2" height="1" fill="#fbc5d4" />
    <rect x="4" y="4" width="3" height="1" fill="#fbc5d4" />
    <rect x="3" y="5" width="4" height="2" fill="#ffffff" />
    <rect x="2" y="7" width="12" height="2" fill="#d9668a" />
    <rect x="3" y="9" width="4" height="2" fill="#fbc5d4" />
    <rect x="4" y="11" width="3" height="1" fill="#c45377" />
    <rect x="6" y="12" width="2" height="1" fill="#c45377" />
    {/* Core highlight */}
    <rect x="3" y="7" width="10" height="1" fill="#ffffff" />
  </svg>
);

// 2. Pixel Forward Arrow (16x16)
export const PixelForward: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Outline */}
    <rect x="8" y="2" width="2" height="1" fill="#452433" />
    <rect x="10" y="3" width="2" height="1" fill="#452433" />
    <rect x="12" y="4" width="2" height="1" fill="#452433" />
    <rect x="13" y="5" width="2" height="2" fill="#452433" />
    <rect x="14" y="7" width="2" height="2" fill="#452433" />
    <rect x="13" y="9" width="2" height="2" fill="#452433" />
    <rect x="12" y="11" width="2" height="1" fill="#452433" />
    <rect x="10" y="12" width="2" height="1" fill="#452433" />
    <rect x="8" y="13" width="2" height="1" fill="#452433" />
    <rect x="7" y="12" width="1" height="1" fill="#452433" />
    <rect x="7" y="3" width="1" height="1" fill="#452433" />
    {/* Shaft outline */}
    <rect x="1" y="6" width="8" height="1" fill="#452433" />
    <rect x="1" y="9" width="8" height="1" fill="#452433" />
    <rect x="1" y="7" width="1" height="2" fill="#452433" />
    {/* Fill */}
    <rect x="8" y="3" width="2" height="1" fill="#fbc5d4" />
    <rect x="9" y="4" width="3" height="1" fill="#fbc5d4" />
    <rect x="9" y="5" width="4" height="2" fill="#ffffff" />
    <rect x="2" y="7" width="12" height="2" fill="#d9668a" />
    <rect x="9" y="9" width="4" height="2" fill="#fbc5d4" />
    <rect x="9" y="11" width="3" height="1" fill="#c45377" />
    <rect x="8" y="12" width="2" height="1" fill="#c45377" />
    {/* Highlight */}
    <rect x="3" y="7" width="10" height="1" fill="#ffffff" />
  </svg>
);

// 3. Pixel Reload / Sprout Refresh (16x16)
export const PixelReload: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Arrow tip top */}
    <rect x="10" y="1" width="4" height="1" fill="#452433" />
    <rect x="13" y="2" width="1" height="4" fill="#452433" />
    <rect x="9" y="2" width="1" height="2" fill="#452433" />
    <rect x="10" y="4" width="2" height="1" fill="#452433" />
    <rect x="10" y="2" width="3" height="2" fill="#d9668a" />
    <rect x="11" y="2" width="1" height="1" fill="#ffffff" />
    {/* Ring arch outline */}
    <rect x="4" y="2" width="5" height="1" fill="#452433" />
    <rect x="2" y="3" width="2" height="2" fill="#452433" />
    <rect x="1" y="5" width="1" height="6" fill="#452433" />
    <rect x="2" y="11" width="2" height="2" fill="#452433" />
    <rect x="4" y="13" width="7" height="1" fill="#452433" />
    <rect x="11" y="11" width="2" height="2" fill="#452433" />
    <rect x="13" y="8" width="1" height="3" fill="#452433" />
    {/* Ring inner hole */}
    <rect x="4" y="5" width="4" height="1" fill="#452433" />
    <rect x="3" y="6" width="1" height="4" fill="#452433" />
    <rect x="4" y="10" width="5" height="1" fill="#452433" />
    <rect x="9" y="8" width="2" height="2" fill="#452433" />
    <rect x="10" y="7" width="1" height="1" fill="#452433" />
    {/* Ring fill (Sakura blossom colors) */}
    <rect x="4" y="3" width="5" height="2" fill="#fbc5d4" />
    <rect x="2" y="5" width="2" height="6" fill="#d9668a" />
    <rect x="4" y="11" width="7" height="2" fill="#c45377" />
    <rect x="11" y="9" width="2" height="2" fill="#fbc5d4" />
    {/* Cute cherry leaf accent in center */}
    <rect x="6" y="7" width="2" height="2" fill="#78b171" />
  </svg>
);

// 4. Pixel Plus / New Tab (16x16)
export const PixelPlus: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Plus outline */}
    <rect x="6" y="1" width="4" height="1" fill="#452433" />
    <rect x="5" y="2" width="1" height="4" fill="#452433" />
    <rect x="10" y="2" width="1" height="4" fill="#452433" />
    <rect x="1" y="6" width="4" height="1" fill="#452433" />
    <rect x="11" y="6" width="4" height="1" fill="#452433" />
    <rect x="0" y="7" width="1" height="2" fill="#452433" />
    <rect x="15" y="7" width="1" height="2" fill="#452433" />
    <rect x="1" y="9" width="4" height="1" fill="#452433" />
    <rect x="11" y="9" width="4" height="1" fill="#452433" />
    <rect x="5" y="10" width="1" height="4" fill="#452433" />
    <rect x="10" y="10" width="1" height="4" fill="#452433" />
    <rect x="6" y="14" width="4" height="1" fill="#452433" />
    {/* Fills: rose petal gradient */}
    <rect x="6" y="2" width="4" height="4" fill="#fbc5d4" />
    <rect x="1" y="7" width="14" height="2" fill="#d9668a" />
    <rect x="6" y="10" width="4" height="4" fill="#c45377" />
    {/* Center flower heart */}
    <rect x="7" y="7" width="2" height="2" fill="#fff5ea" />
    <rect x="6" y="3" width="2" height="2" fill="#ffffff" />
  </svg>
);

// 5. Pixel Close 'x' (16x16)
export const PixelClose: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Dark outline */}
    <rect x="2" y="2" width="3" height="1" fill="#452433" />
    <rect x="11" y="2" width="3" height="1" fill="#452433" />
    <rect x="1" y="3" width="1" height="3" fill="#452433" />
    <rect x="14" y="3" width="1" height="3" fill="#452433" />
    <rect x="3" y="5" width="2" height="1" fill="#452433" />
    <rect x="11" y="5" width="2" height="1" fill="#452433" />
    <rect x="5" y="6" width="2" height="1" fill="#452433" />
    <rect x="9" y="6" width="2" height="1" fill="#452433" />
    <rect x="6" y="7" width="4" height="2" fill="#452433" />
    <rect x="5" y="9" width="2" height="1" fill="#452433" />
    <rect x="9" y="9" width="2" height="1" fill="#452433" />
    <rect x="3" y="10" width="2" height="1" fill="#452433" />
    <rect x="11" y="10" width="2" height="1" fill="#452433" />
    <rect x="1" y="10" width="1" height="3" fill="#452433" />
    <rect x="14" y="10" width="1" height="3" fill="#452433" />
    <rect x="2" y="13" width="3" height="1" fill="#452433" />
    <rect x="11" y="13" width="3" height="1" fill="#452433" />
    {/* Rose fill */}
    <rect x="2" y="3" width="3" height="2" fill="#fbc5d4" />
    <rect x="11" y="3" width="3" height="2" fill="#fbc5d4" />
    <rect x="4" y="5" width="2" height="2" fill="#d9668a" />
    <rect x="10" y="5" width="2" height="2" fill="#d9668a" />
    <rect x="7" y="7" width="2" height="2" fill="#ffffff" />
    <rect x="4" y="9" width="2" height="2" fill="#c45377" />
    <rect x="10" y="9" width="2" height="2" fill="#c45377" />
    <rect x="2" y="11" width="3" height="2" fill="#c45377" />
    <rect x="11" y="11" width="3" height="2" fill="#c45377" />
  </svg>
);

// 6. Pixel Shield / Adblock (16x16)
export const PixelShield: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Shield outer border */}
    <rect x="2" y="1" width="12" height="1" fill="#452433" />
    <rect x="1" y="2" width="1" height="7" fill="#452433" />
    <rect x="14" y="2" width="1" height="7" fill="#452433" />
    <rect x="2" y="9" width="1" height="2" fill="#452433" />
    <rect x="13" y="9" width="1" height="2" fill="#452433" />
    <rect x="3" y="11" width="2" height="1" fill="#452433" />
    <rect x="11" y="11" width="2" height="1" fill="#452433" />
    <rect x="5" y="12" width="2" height="1" fill="#452433" />
    <rect x="9" y="12" width="2" height="1" fill="#452433" />
    <rect x="7" y="13" width="2" height="2" fill="#452433" />
    {/* Cozy wooden / blush fill */}
    <rect x="2" y="2" width="12" height="7" fill="#fbc5d4" />
    <rect x="3" y="9" width="10" height="2" fill="#f49cb5" />
    <rect x="5" y="11" width="6" height="1" fill="#d9668a" />
    <rect x="7" y="12" width="2" height="1" fill="#c45377" />
    {/* White highlight strip */}
    <rect x="2" y="2" width="11" height="1" fill="#ffffff" />
    <rect x="2" y="3" width="1" height="5" fill="#ffffff" />
    {/* Cute center cherry emblem */}
    <rect x="7" y="4" width="2" height="1" fill="#6d9f58" />
    <rect x="5" y="5" width="6" height="3" fill="#d9668a" />
    <rect x="6" y="8" width="4" height="1" fill="#c45377" />
    <rect x="6" y="5" width="2" height="1" fill="#ffffff" />
  </svg>
);

// 7. Pixel Zen / Teacup (16x16)
export const PixelZen: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Rising steam */}
    <rect x="5" y="1" width="1" height="2" fill="#d9668a" opacity="0.8" />
    <rect x="8" y="0" width="1" height="2" fill="#d9668a" opacity="0.8" />
    <rect x="11" y="1" width="1" height="2" fill="#d9668a" opacity="0.8" />
    {/* Cup rim */}
    <rect x="2" y="4" width="10" height="1" fill="#452433" />
    {/* Cup body outline */}
    <rect x="1" y="5" width="1" height="6" fill="#452433" />
    <rect x="12" y="5" width="1" height="6" fill="#452433" />
    <rect x="2" y="11" width="1" height="1" fill="#452433" />
    <rect x="11" y="11" width="1" height="1" fill="#452433" />
    <rect x="3" y="12" width="8" height="1" fill="#452433" />
    {/* Saucer outline */}
    <rect x="1" y="13" width="12" height="1" fill="#452433" />
    <rect x="2" y="14" width="10" height="1" fill="#452433" />
    {/* Handle outline */}
    <rect x="13" y="6" width="2" height="1" fill="#452433" />
    <rect x="15" y="7" width="1" height="3" fill="#452433" />
    <rect x="13" y="10" width="2" height="1" fill="#452433" />
    {/* Handle fill */}
    <rect x="13" y="7" width="2" height="3" fill="#fff5ea" />
    <rect x="13" y="8" width="1" height="1" fill="#fbc5d4" />
    {/* Cup fill (Warm cream ceramic with matcha green tea) */}
    <rect x="3" y="5" width="8" height="2" fill="#78b171" />
    <rect x="4" y="5" width="3" height="1" fill="#a4d19d" />
    <rect x="2" y="7" width="10" height="4" fill="#fff5ea" />
    <rect x="2" y="7" width="2" height="4" fill="#ffffff" />
    <rect x="9" y="8" width="3" height="3" fill="#fedce5" />
    {/* Cute pink heart on cup */}
    <rect x="6" y="8" width="1" height="1" fill="#d9668a" />
    <rect x="8" y="8" width="1" height="1" fill="#d9668a" />
    <rect x="5" y="9" width="5" height="1" fill="#d9668a" />
    <rect x="6" y="10" width="3" height="1" fill="#d9668a" />
    <rect x="7" y="11" width="1" height="1" fill="#d9668a" />
  </svg>
);

// 8. Pixel MCP / Cute Farming Bot (16x16)
export const PixelMcp: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Sprout antenna */}
    <rect x="6" y="0" width="1" height="1" fill="#78b171" />
    <rect x="8" y="0" width="2" height="1" fill="#78b171" />
    <rect x="7" y="1" width="2" height="1" fill="#78b171" />
    <rect x="7" y="2" width="1" height="2" fill="#452433" />
    {/* Head outline */}
    <rect x="3" y="4" width="9" height="1" fill="#452433" />
    <rect x="2" y="5" width="1" height="8" fill="#452433" />
    <rect x="12" y="5" width="1" height="8" fill="#452433" />
    <rect x="3" y="13" width="9" height="1" fill="#452433" />
    {/* Ears */}
    <rect x="0" y="7" width="2" height="3" fill="#452433" />
    <rect x="1" y="8" width="1" height="1" fill="#fbc5d4" />
    <rect x="13" y="7" width="2" height="3" fill="#452433" />
    <rect x="13" y="8" width="1" height="1" fill="#fbc5d4" />
    {/* Head fill (Cute cream tin bot) */}
    <rect x="3" y="5" width="9" height="8" fill="#fff5ea" />
    <rect x="3" y="5" width="9" height="1" fill="#ffffff" />
    {/* Eyes */}
    <rect x="5" y="7" width="1" height="2" fill="#452433" />
    <rect x="9" y="7" width="1" height="2" fill="#452433" />
    {/* Rosy cheeks */}
    <rect x="4" y="9" width="2" height="1" fill="#f49cb5" />
    <rect x="9" y="9" width="2" height="1" fill="#f49cb5" />
    {/* Cute mouth */}
    <rect x="7" y="10" width="1" height="1" fill="#d9668a" />
  </svg>
);

// 9. Pixel Palette (16x16)
export const PixelPalette: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Palette outline */}
    <rect x="4" y="1" width="8" height="1" fill="#452433" />
    <rect x="2" y="2" width="2" height="1" fill="#452433" />
    <rect x="12" y="2" width="2" height="1" fill="#452433" />
    <rect x="1" y="3" width="1" height="8" fill="#452433" />
    <rect x="14" y="3" width="1" height="6" fill="#452433" />
    <rect x="2" y="11" width="1" height="2" fill="#452433" />
    <rect x="3" y="13" width="3" height="1" fill="#452433" />
    <rect x="6" y="12" width="1" height="1" fill="#452433" />
    <rect x="7" y="10" width="1" height="2" fill="#452433" />
    <rect x="8" y="9" width="3" height="1" fill="#452433" />
    <rect x="11" y="9" width="1" height="1" fill="#452433" />
    <rect x="12" y="10" width="1" height="2" fill="#452433" />
    <rect x="13" y="12" width="1" height="1" fill="#452433" />
    <rect x="14" y="9" width="1" height="3" fill="#452433" />
    {/* Wood palette body */}
    <rect x="3" y="2" width="9" height="9" fill="#f4d0a9" />
    <rect x="2" y="3" width="1" height="8" fill="#ffe3c5" />
    <rect x="3" y="2" width="9" height="1" fill="#fff5ea" />
    <rect x="3" y="11" width="4" height="2" fill="#ddb387" />
    {/* Paint spots: Rose, Matcha, Gold, Plum */}
    <rect x="4" y="4" width="2" height="2" fill="#d9668a" />
    <rect x="8" y="3" width="2" height="2" fill="#78b171" />
    <rect x="11" y="5" width="2" height="2" fill="#f5ba58" />
    <rect x="4" y="8" width="2" height="2" fill="#8a5d72" />
  </svg>
);

// 10. Pixel Sidebar / Book Toggle (16x16)
export const PixelSidebar: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Outer frame */}
    <rect x="1" y="2" width="14" height="1" fill="#452433" />
    <rect x="1" y="13" width="14" height="1" fill="#452433" />
    <rect x="0" y="3" width="1" height="10" fill="#452433" />
    <rect x="15" y="3" width="1" height="10" fill="#452433" />
    {/* Left sidebar divider */}
    <rect x="5" y="3" width="1" height="10" fill="#452433" />
    {/* Sidebar area (Petal pink) */}
    <rect x="1" y="3" width="4" height="10" fill="#fbc5d4" />
    <rect x="2" y="5" width="2" height="1" fill="#ffffff" />
    <rect x="2" y="7" width="2" height="1" fill="#d9668a" />
    <rect x="2" y="9" width="2" height="1" fill="#c45377" />
    {/* Main content area (Cream) */}
    <rect x="6" y="3" width="9" height="10" fill="#fff5ea" />
    <rect x="7" y="5" width="6" height="1" fill="#eed5c3" />
    <rect x="7" y="7" width="4" height="1" fill="#eed5c3" />
  </svg>
);

// 11. Pixel Play (16x16)
export const PixelPlay: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    <rect x="3" y="2" width="2" height="12" fill="#452433" />
    <rect x="5" y="3" width="2" height="10" fill="#452433" />
    <rect x="7" y="4" width="2" height="8" fill="#452433" />
    <rect x="9" y="5" width="2" height="6" fill="#452433" />
    <rect x="11" y="6" width="2" height="4" fill="#452433" />
    <rect x="13" y="7" width="1" height="2" fill="#452433" />

    <rect x="4" y="3" width="1" height="10" fill="#fbc5d4" />
    <rect x="5" y="4" width="2" height="8" fill="#d9668a" />
    <rect x="7" y="5" width="2" height="6" fill="#d9668a" />
    <rect x="9" y="6" width="2" height="4" fill="#c45377" />
    <rect x="11" y="7" width="1" height="2" fill="#ffffff" />
  </svg>
);

// 12. Pixel Pause (16x16)
export const PixelPause: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Bar 1 */}
    <rect x="3" y="2" width="4" height="1" fill="#452433" />
    <rect x="2" y="3" width="1" height="10" fill="#452433" />
    <rect x="7" y="3" width="1" height="10" fill="#452433" />
    <rect x="3" y="13" width="4" height="1" fill="#452433" />
    <rect x="3" y="3" width="4" height="10" fill="#d9668a" />
    <rect x="3" y="3" width="2" height="10" fill="#ffffff" />
    {/* Bar 2 */}
    <rect x="10" y="2" width="4" height="1" fill="#452433" />
    <rect x="9" y="3" width="1" height="10" fill="#452433" />
    <rect x="14" y="3" width="1" height="10" fill="#452433" />
    <rect x="10" y="13" width="4" height="1" fill="#452433" />
    <rect x="10" y="3" width="4" height="10" fill="#d9668a" />
    <rect x="10" y="3" width="2" height="10" fill="#ffffff" />
  </svg>
);

// 13. Pixel Search / Magnifying Glass (16x16)
export const PixelSearch: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Lens outline */}
    <rect x="4" y="1" width="5" height="1" fill="#452433" />
    <rect x="2" y="2" width="2" height="1" fill="#452433" />
    <rect x="9" y="2" width="2" height="1" fill="#452433" />
    <rect x="1" y="4" width="1" height="4" fill="#452433" />
    <rect x="11" y="4" width="1" height="4" fill="#452433" />
    <rect x="2" y="8" width="2" height="1" fill="#452433" />
    <rect x="9" y="8" width="2" height="1" fill="#452433" />
    <rect x="4" y="10" width="5" height="1" fill="#452433" />
    {/* Lens glass fill */}
    <rect x="3" y="3" width="7" height="6" fill="#fff5ea" />
    <rect x="3" y="3" width="3" height="3" fill="#ffffff" />
    <rect x="6" y="6" width="3" height="2" fill="#fbc5d4" />
    {/* Handle */}
    <rect x="9" y="9" width="3" height="3" fill="#452433" />
    <rect x="11" y="11" width="3" height="3" fill="#452433" />
    <rect x="13" y="13" width="3" height="3" fill="#452433" />
    <rect x="10" y="10" width="1" height="1" fill="#d9668a" />
    <rect x="12" y="12" width="1" height="1" fill="#fbc5d4" />
  </svg>
);

// 14. Pixel Globe / Cherry Blossom (16x16)
export const PixelGlobe: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Top Petal */}
    <rect x="6" y="1" width="4" height="4" fill="#fbc5d4" />
    <rect x="7" y="1" width="2" height="1" fill="#452433" />
    {/* Left Petal */}
    <rect x="2" y="5" width="4" height="4" fill="#fbc5d4" />
    <rect x="1" y="6" width="1" height="2" fill="#452433" />
    {/* Right Petal */}
    <rect x="10" y="5" width="4" height="4" fill="#fbc5d4" />
    <rect x="14" y="6" width="1" height="2" fill="#452433" />
    {/* Bottom Left Petal */}
    <rect x="3" y="9" width="4" height="4" fill="#d9668a" />
    {/* Bottom Right Petal */}
    <rect x="9" y="9" width="4" height="4" fill="#d9668a" />
    {/* Center Core */}
    <rect x="6" y="6" width="4" height="4" fill="#fff5ea" />
    <rect x="7" y="7" width="2" height="2" fill="#f5ba58" />
  </svg>
);

// 15. Pixel Lock (16x16)
export const PixelLock: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Shackle */}
    <rect x="5" y="2" width="6" height="1" fill="#452433" />
    <rect x="4" y="3" width="2" height="5" fill="#452433" />
    <rect x="10" y="3" width="2" height="5" fill="#452433" />
    <rect x="6" y="3" width="4" height="4" fill="#fdeef2" />
    <rect x="5" y="3" width="1" height="4" fill="#ffffff" />
    {/* Body */}
    <rect x="2" y="7" width="12" height="8" fill="#452433" />
    <rect x="3" y="8" width="10" height="6" fill="#f5ba58" />
    <rect x="3" y="8" width="10" height="1" fill="#fff4e6" />
    {/* Keyhole */}
    <rect x="7" y="10" width="2" height="2" fill="#452433" />
    <rect x="7.5" y="11" width="1" height="2" fill="#452433" />
  </svg>
);

// 16. Pixel Chevron Down (16x16)
export const PixelChevronDown: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    <rect x="2" y="5" width="2" height="2" fill="#5a3345" />
    <rect x="4" y="7" width="2" height="2" fill="#5a3345" />
    <rect x="6" y="9" width="2" height="2" fill="#5a3345" />
    <rect x="8" y="9" width="2" height="2" fill="#5a3345" />
    <rect x="10" y="7" width="2" height="2" fill="#5a3345" />
    <rect x="12" y="5" width="2" height="2" fill="#5a3345" />
  </svg>
);

// 17. Pixel Chevron Up (16x16)
export const PixelChevronUp: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    <rect x="2" y="9" width="2" height="2" fill="#5a3345" />
    <rect x="4" y="7" width="2" height="2" fill="#5a3345" />
    <rect x="6" y="5" width="2" height="2" fill="#5a3345" />
    <rect x="8" y="5" width="2" height="2" fill="#5a3345" />
    <rect x="10" y="7" width="2" height="2" fill="#5a3345" />
    <rect x="12" y="9" width="2" height="2" fill="#5a3345" />
  </svg>
);

// 18. Pixel Pin (16x16)
export const PixelPin: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    <rect x="5" y="2" width="6" height="2" fill="#d9668a" />
    <rect x="6" y="4" width="4" height="4" fill="#fbc5d4" />
    <rect x="4" y="8" width="8" height="2" fill="#d9668a" />
    <rect x="7" y="10" width="2" height="4" fill="#5a3345" />
    <rect x="8" y="14" width="1" height="1" fill="#5a3345" />
  </svg>
);

// 19. Pixel Volume (16x16)
export const PixelVolume: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    <rect x="2" y="5" width="3" height="6" fill="#5a3345" />
    <rect x="5" y="4" width="2" height="8" fill="#5a3345" />
    <rect x="7" y="2" width="2" height="12" fill="#5a3345" />
    <rect x="11" y="4" width="2" height="2" fill="#d9668a" />
    <rect x="13" y="6" width="2" height="4" fill="#d9668a" />
    <rect x="11" y="10" width="2" height="2" fill="#d9668a" />
  </svg>
);

// 20. Pixel Moon (16x16)
export const PixelMoon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    <rect x="6" y="2" width="4" height="2" fill="#ffd166" />
    <rect x="10" y="3" width="2" height="2" fill="#ffd166" />
    <rect x="4" y="4" width="2" height="8" fill="#ffd166" />
    <rect x="6" y="12" width="4" height="2" fill="#ffd166" />
    <rect x="10" y="11" width="2" height="2" fill="#ffd166" />
    <rect x="7" y="5" width="2" height="6" fill="#f4a261" />
  </svg>
);

// 21. Pixel Sun (16x16)
export const PixelSun: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    <rect x="7" y="1" width="2" height="2" fill="#ffb703" />
    <rect x="7" y="13" width="2" height="2" fill="#ffb703" />
    <rect x="1" y="7" width="2" height="2" fill="#ffb703" />
    <rect x="13" y="7" width="2" height="2" fill="#ffb703" />
    <rect x="5" y="5" width="6" height="6" fill="#ffd166" />
    <rect x="6" y="6" width="4" height="4" fill="#fb8500" />
    <rect x="3" y="3" width="2" height="2" fill="#ffb703" />
    <rect x="11" y="3" width="2" height="2" fill="#ffb703" />
    <rect x="3" y="11" width="2" height="2" fill="#ffb703" />
    <rect x="11" y="11" width="2" height="2" fill="#ffb703" />
  </svg>
);

// 21. Pixel Layers (16x16)
export const PixelLayers: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={pixelSvgStyle}
    className={`pixel-art-icon ${className}`}
    {...props}
  >
    {/* Top card */}
    <rect x="4" y="2" width="9" height="7" fill="#ffffff" />
    <rect x="4" y="2" width="9" height="1" fill="#452433" />
    <rect x="4" y="8" width="9" height="1" fill="#452433" />
    <rect x="3" y="3" width="1" height="5" fill="#452433" />
    <rect x="13" y="3" width="1" height="5" fill="#452433" />
    <rect x="5" y="4" width="7" height="3" fill="#fbc5d4" />

    {/* Bottom peek card */}
    <rect x="1" y="7" width="9" height="7" fill="#ffe4ec" />
    <rect x="1" y="7" width="3" height="1" fill="#452433" />
    <rect x="1" y="13" width="9" height="1" fill="#452433" />
    <rect x="0" y="8" width="1" height="5" fill="#452433" />
    <rect x="10" y="10" width="1" height="3" fill="#452433" />
    <rect x="2" y="9" width="7" height="3" fill="#d9668a" />
  </svg>
);

