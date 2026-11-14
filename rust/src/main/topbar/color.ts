// Pure color utilities for the Dia-style top bar tint (R20).
// No Electron or Node imports: the renderer imports this module directly.

/** An sRGB color. r/g/b are integers 0..255, a is 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A color given either as parsed channels or as a CSS color string. */
export type ColorInput = Rgba | string;

/**
 * Result of resolving the top bar color.
 * - `default`: use the default theme colors (internal page or no usable color, R20.5/20.6).
 * - `theme-color`: the page's valid `theme-color` meta value (R20.1).
 * - `sampled`: the color sampled from the top edge of the page (R20.2).
 * `color` is always opaque (a = 1) so contrast against it is well defined.
 */
export type ResolvedPageColor =
  | { source: 'default' }
  | { source: 'theme-color' | 'sampled'; color: Rgba };

/** WCAG AA minimum contrast for normal text. */
export const MIN_CONTRAST = 4.5;

export const BLACK: Rgba = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });
export const WHITE: Rgba = Object.freeze({ r: 255, g: 255, b: 255, a: 1 });

const NAMED: Record<string, [number, number, number, number]> = {
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  lime: [0, 255, 0, 1],
  blue: [0, 0, 255, 1],
  yellow: [255, 255, 0, 1],
  cyan: [0, 255, 255, 1],
  aqua: [0, 255, 255, 1],
  magenta: [255, 0, 255, 1],
  fuchsia: [255, 0, 255, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
  silver: [192, 192, 192, 1],
  maroon: [128, 0, 0, 1],
  olive: [128, 128, 0, 1],
  navy: [0, 0, 128, 1],
  purple: [128, 0, 128, 1],
  teal: [0, 128, 128, 1],
  orange: [255, 165, 0, 1],
  transparent: [0, 0, 0, 0],
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function make(r: number, g: number, b: number, a: number): Rgba {
  return {
    r: Math.round(clamp(r, 0, 255)),
    g: Math.round(clamp(g, 0, 255)),
    b: Math.round(clamp(b, 0, 255)),
    a: clamp(a, 0, 1),
  };
}

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function parseNumber(s: string): number | null {
  return NUM.test(s) ? Number(s) : null;
}

/** Channel 0..255 from "128" or "50%". */
function parseRgbChannel(s: string): number | null {
  if (s.endsWith('%')) {
    const n = parseNumber(s.slice(0, -1));
    return n === null ? null : (n / 100) * 255;
  }
  return parseNumber(s);
}

/** Alpha 0..1 from "0.5" or "50%". */
function parseAlpha(s: string): number | null {
  if (s.endsWith('%')) {
    const n = parseNumber(s.slice(0, -1));
    return n === null ? null : n / 100;
  }
  return parseNumber(s);
}

function parsePercent(s: string): number | null {
  if (!s.endsWith('%')) return null;
  const n = parseNumber(s.slice(0, -1));
  return n === null ? null : n / 100;
}

/** Hue in degrees from "120", "120deg", "0.5turn", "3.14rad", "200grad". */
function parseHue(s: string): number | null {
  const m = /^(.*?)(deg|turn|rad|grad)?$/i.exec(s);
  if (!m) return null;
  const n = parseNumber(m[1]);
  if (n === null) return null;
  switch ((m[2] ?? 'deg').toLowerCase()) {
    case 'turn':
      return n * 360;
    case 'rad':
      return (n * 180) / Math.PI;
    case 'grad':
      return n * 0.9;
    default:
      return n;
  }
}

/**
 * Split the inside of rgb()/hsl() into 3 components plus optional alpha.
 * Accepts legacy comma syntax and modern space syntax with "/ alpha".
 */
function splitArgs(inner: string): { parts: string[]; alpha: string | null } | null {
  const s = inner.trim();
  if (s.includes(',')) {
    const parts = s.split(',').map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    if (parts.some((p) => p === '' || /\s/.test(p))) return null;
    return { parts: parts.slice(0, 3), alpha: parts[3] ?? null };
  }
  const [main, alpha, ...rest] = s.split('/').map((p) => p.trim());
  if (rest.length > 0 || alpha === '') return null;
  const parts = main.split(/\s+/).filter(Boolean);
  if (parts.length !== 3) return null;
  return { parts, alpha: alpha ?? null };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const lig = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function parseHex(hex: string): Rgba | null {
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  if (hex.length === 3 || hex.length === 4) {
    const v = hex.split('').map((c) => parseInt(c + c, 16));
    return make(v[0], v[1], v[2], hex.length === 4 ? v[3] / 255 : 1);
  }
  if (hex.length === 6 || hex.length === 8) {
    const v = [0, 2, 4, 6].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return make(v[0], v[1], v[2], hex.length === 8 ? v[3] / 255 : 1);
  }
  return null;
}

/**
 * Parse a CSS color: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba(),
 * hsl()/hsla() and a basic set of named colors. Returns null when invalid.
 */
export function parseCssColor(input: unknown): Rgba | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s === '') return null;

  if (s.startsWith('#')) return parseHex(s.slice(1));

  const named = NAMED[s];
  if (named) return make(named[0], named[1], named[2], named[3]);

  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(s);
  if (!fn) return null;
  const args = splitArgs(fn[2]);
  if (!args) return null;

  let alpha = 1;
  if (args.alpha !== null) {
    const a = parseAlpha(args.alpha);
    if (a === null) return null;
    alpha = a;
  }

  if (fn[1].startsWith('rgb')) {
    const ch = args.parts.map(parseRgbChannel);
    if (ch.some((c) => c === null)) return null;
    return make(ch[0]!, ch[1]!, ch[2]!, alpha);
  }

  const h = parseHue(args.parts[0]);
  const sat = parsePercent(args.parts[1]);
  const lig = parsePercent(args.parts[2]);
  if (h === null || sat === null || lig === null) return null;
  const [r, g, b] = hslToRgb(h, sat, lig);
  return make(r, g, b, alpha);
}

function isRgba(v: unknown): v is Rgba {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return ['r', 'g', 'b', 'a'].every((k) => typeof c[k] === 'number' && Number.isFinite(c[k] as number));
}

/** Normalize a color input to Rgba, or null when it is not a usable color. */
export function toRgba(input: unknown): Rgba | null {
  if (typeof input === 'string') return parseCssColor(input);
  if (isRgba(input)) return make(input.r, input.g, input.b, input.a);
  return null;
}

/** Format as #rrggbb (alpha is dropped). */
export function toCssHex(color: Rgba): string {
  const h = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(color.r)}${h(color.g)}${h(color.b)}`;
}

/** A color is usable for the top bar when it parses and is not fully transparent. */
function usable(input: unknown): Rgba | null {
  const c = toRgba(input);
  if (!c || c.a === 0) return null;
  return { ...c, a: 1 };
}

/**
 * Precedence (design "Dia-style top bar tint"):
 * internal page -> default; else valid theme-color; else sampled color; else default.
 */
export function resolvePageColor(
  themeColor: string | null | undefined,
  sampledColor: ColorInput | null | undefined,
  isInternalPage: boolean,
): ResolvedPageColor {
  if (isInternalPage) return { source: 'default' };
  const theme = usable(themeColor);
  if (theme) return { source: 'theme-color', color: theme };
  const sampled = usable(sampledColor);
  if (sampled) return { source: 'sampled', color: sampled };
  return { source: 'default' };
}

function linearize(channel: number): number {
  const c = clamp(channel, 0, 255) / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2 relative luminance (0..1). Alpha is ignored. Invalid input throws. */
export function relativeLuminance(color: ColorInput): number {
  const c = toRgba(color);
  if (!c) throw new Error(`Invalid color: ${String(color)}`);
  return 0.2126 * linearize(c.r) + 0.7152 * linearize(c.g) + 0.0722 * linearize(c.b);
}

/** WCAG 2 contrast ratio (1..21) between two colors. */
export function contrastRatio(a: ColorInput, b: ColorInput): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pick black or white, whichever contrasts more with `bg` (alpha ignored).
 * The better of the two is always >= ~4.58:1, so the result meets MIN_CONTRAST.
 */
export function pickForeground(bg: ColorInput): Rgba {
  const toBlack = contrastRatio(bg, BLACK);
  const toWhite = contrastRatio(bg, WHITE);
  return { ...(toBlack >= toWhite ? BLACK : WHITE) };
}
