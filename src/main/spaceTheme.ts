export type SpaceThemeMode = 'light' | 'dark' | 'auto';
export type SpaceGlowStyle = 'theme' | 'prism' | 'custom' | 'off';

export interface SpaceGlowSettings {
  style: SpaceGlowStyle;
  color: string;
  intensity: number;
  speed: number;
  size: number;
}

export const DEFAULT_SPACE_GLOW: Readonly<SpaceGlowSettings> = Object.freeze({
  style: 'theme',
  color: '#F59E0B',
  intensity: 0.56,
  speed: 0.55,
  size: 0.58,
});

export interface SpaceThemePoint {
  color: string;
  x: number;
  y: number;
}

export interface SpaceTheme {
  points: SpaceThemePoint[];
  intensity: number;
  grain: number;
  mode: SpaceThemeMode;
  glow?: SpaceGlowSettings;
}

export type SpaceThemesMap = Record<string, SpaceTheme>;

export interface SpaceThemePreset {
  id: string;
  name: string;
  description: string;
  theme: SpaceTheme;
}

export interface ThemePalette {
  effectiveMode: 'light' | 'dark';
  c1: string;
  c2: string;
  c3: string;
  hasThirdPoint: boolean;
  glowC1: string;
  glowC2: string;
  glowC3: string;
  glowC4: string;
  glowStyle: SpaceGlowStyle;
  glowIntensity: number;
  glowSpeed: number;
  glowSize: number;
  fg: string;
  fgMuted: string;
  fgFaint: string;
  surface: string;
  surfaceSolid: string;
  surfaceHover: string;
  bgApp: string;
  bgSidebar: string;
  bgCard: string;
  bgInput: string;
  border: string;
  borderStrong: string;
  borderSubtle: string;
  accent: string;
  accentSoft: string;
  accentGlow: string;
  backdropC1: string;
  backdropC2: string;
  backdropC3: string;
  minContrast: number;
}

export function clamp01(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

export function clampWheelPos(x: unknown, y: unknown, fallbackX = 0.5, fallbackY = 0.5): { x: number; y: number } {
  const nx = typeof x === 'number' && Number.isFinite(x) ? x : Number.isFinite(Number(x)) ? Number(x) : fallbackX;
  const ny = typeof y === 'number' && Number.isFinite(y) ? y : Number.isFinite(Number(y)) ? Number(y) : fallbackY;
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.5) {
    return {
      x: Math.max(0, Math.min(1, nx)),
      y: Math.max(0, Math.min(1, ny)),
    };
  }
  const scale = 0.5 / dist;
  return {
    x: Math.max(0, Math.min(1, 0.5 + dx * scale)),
    y: Math.max(0, Math.min(1, 0.5 + dy * scale)),
  };
}

export function wheelPosToHueSat(x: number, y: number): { hue: number; saturation: number } {
  const clamped = clampWheelPos(x, y);
  const dx = clamped.x - 0.5;
  const dy = clamped.y - 0.5;
  const dist = Math.hypot(dx, dy);
  const saturation = Math.max(0, Math.min(100, (dist / 0.5) * 100));
  if (dist < 1e-6) {
    return { hue: 0, saturation: 0 };
  }
  const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  return { hue: angleDeg, saturation };
}

export function hueSatToWheelPos(hue: number, saturation: number): { x: number; y: number } {
  const h = Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 0;
  const s = Number.isFinite(saturation) ? Math.max(0, Math.min(100, saturation)) : 0;
  const radius = (s / 100) * 0.5;
  const rad = (h * Math.PI) / 180;
  return {
    x: Math.max(0, Math.min(1, 0.5 + radius * Math.cos(rad))),
    y: Math.max(0, Math.min(1, 0.5 + radius * Math.sin(rad))),
  };
}

export function normalizeHex(raw: unknown, fallback = '#1F7A53'): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const expanded = trimmed
      .split('')
      .map((ch) => ch + ch)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  return fallback;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeHex(hex, '#000000').slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r: r255, g: g255, b: b255 } = hexToRgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta < 1e-6) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) {
    h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / delta + 2) * 60;
  } else {
    h = ((r - g) / delta + 4) * 60;
  }

  return {
    h: ((h % 360) + 360) % 360,
    s: Math.max(0, Math.min(100, s * 100)),
    l: Math.max(0, Math.min(100, l * 100)),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hn < 60) {
    r = c;
    g = x;
  } else if (hn < 120) {
    r = x;
    g = c;
  } else if (hn < 180) {
    g = c;
    b = x;
  } else if (hn < 240) {
    g = x;
    b = c;
  } else if (hn < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function colorAtWheelPos(x: number, y: number, lightness = 52): string {
  const { hue, saturation } = wheelPosToHueSat(x, y);
  return hslToHex(hue, saturation, lightness);
}

export function wheelPosToColorKeepingLightness(x: number, y: number, existingHex?: string): string {
  const { hue, saturation } = wheelPosToHueSat(x, y);
  const existingL = existingHex ? hexToHsl(existingHex).l : 52;
  const safeL = existingL < 16 || existingL > 86 ? 52 : existingL;
  return hslToHex(hue, saturation, safeL);
}

export function colorToWheelPos(hex: string): { x: number; y: number } {
  const { h, s } = hexToHsl(hex);
  return hueSatToWheelPos(h, s);
}

function linearizeChannel(channel255: number): number {
  const srgb = channel255 / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function hexLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = hexLuminance(hexA);
  const lumB = hexLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function mixHex(bgHex: string, fgHex: string, alpha: number): string {
  const a = clamp01(alpha, 0);
  const bg = hexToRgb(bgHex);
  const fg = hexToRgb(fgHex);
  return rgbToHex(
    bg.r * (1 - a) + fg.r * a,
    bg.g * (1 - a) + fg.g * a,
    bg.b * (1 - a) + fg.b * a
  );
}

function makePoint(color: string, x?: number, y?: number): SpaceThemePoint {
  const hex = normalizeHex(color, '#1F7A53');
  if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
    const pos = clampWheelPos(x, y);
    return { color: hex, x: pos.x, y: pos.y };
  }
  const derived = colorToWheelPos(hex);
  return { color: hex, x: derived.x, y: derived.y };
}

export const SPACE_THEME_PRESETS: SpaceThemePreset[] = [
  {
    id: 'evergreen-mist',
    name: 'Evergreen Mist',
    description: 'Deep Neutrino pine & sage glow',
    theme: {
      points: [makePoint('#0F6B4B'), makePoint('#22A06B'), makePoint('#083022')],
      intensity: 0.72,
      grain: 0.26,
      mode: 'dark',
    },
  },
  {
    id: 'obsidian-mono',
    name: 'Obsidian Mono',
    description: 'Quiet charcoal & prism aura glow',
    theme: {
      points: [makePoint('#1F242D'), makePoint('#334155'), makePoint('#111827')],
      intensity: 0.5,
      grain: 0.22,
      mode: 'dark',
      glow: {
        style: 'prism',
        color: '#F59E0B',
        intensity: 0.52,
        speed: 0.55,
        size: 0.58,
      },
    },
  },
  {
    id: 'aurora-violet',
    name: 'Aurora Violet',
    description: 'Indigo twilight & electric plum',
    theme: {
      points: [makePoint('#4F46E5'), makePoint('#9333EA'), makePoint('#0EA5E9')],
      intensity: 0.64,
      grain: 0.26,
      mode: 'dark',
    },
  },
  {
    id: 'cobalt-dusk',
    name: 'Cobalt Dusk',
    description: 'Ocean blue & arctic cyan',
    theme: {
      points: [makePoint('#1D4ED8'), makePoint('#0284C7')],
      intensity: 0.58,
      grain: 0.22,
      mode: 'dark',
    },
  },
  {
    id: 'solar-horizon',
    name: 'Solar Horizon',
    description: 'Burnt amber & ember rose',
    theme: {
      points: [makePoint('#EA580C'), makePoint('#D97706'), makePoint('#9F1239')],
      intensity: 0.58,
      grain: 0.24,
      mode: 'dark',
    },
  },
  {
    id: 'velvet-plum',
    name: 'Velvet Plum',
    description: 'Wineberry & soft magenta mist',
    theme: {
      points: [makePoint('#7E22CE'), makePoint('#BE185D')],
      intensity: 0.56,
      grain: 0.24,
      mode: 'dark',
    },
  },
  {
    id: 'northern-sea',
    name: 'Northern Sea',
    description: 'Deep fjord teal & spruce',
    theme: {
      points: [makePoint('#0F766E'), makePoint('#0369A1'), makePoint('#134E4A')],
      intensity: 0.6,
      grain: 0.24,
      mode: 'dark',
    },
  },
  {
    id: 'warm-linen',
    name: 'Warm Linen',
    description: 'Alabaster sand & toasted oak',
    theme: {
      points: [makePoint('#EBD8C3'), makePoint('#D4B499')],
      intensity: 0.68,
      grain: 0.18,
      mode: 'light',
    },
  },
  {
    id: 'matcha-breeze',
    name: 'Matcha Breeze',
    description: 'Soft celadon & sunlit meadow',
    theme: {
      points: [makePoint('#BEE3CE'), makePoint('#84CFA8'), makePoint('#E6F4EC')],
      intensity: 0.65,
      grain: 0.18,
      mode: 'light',
    },
  },
  {
    id: 'rose-dawn',
    name: 'Rose Dawn',
    description: 'Blush petal & warm apricot',
    theme: {
      points: [makePoint('#F6C6D8'), makePoint('#F9CEAA')],
      intensity: 0.64,
      grain: 0.16,
      mode: 'light',
    },
  },
];

export const DEFAULT_SPACE_THEME: SpaceTheme = cloneSpaceTheme(SPACE_THEME_PRESETS[0].theme);

const SPACE_DEFAULT_PRESET_MAP: Record<string, string> = {
  'space-study': 'evergreen-mist',
  'space-work': 'obsidian-mono',
  'space-leisure': 'aurora-violet',
};

export function validateAndClampSpaceGlow(
  raw: unknown,
  fallback: SpaceGlowSettings = DEFAULT_SPACE_GLOW
): SpaceGlowSettings {
  const safeFallback: SpaceGlowSettings = {
    style:
      fallback.style === 'theme' ||
        fallback.style === 'prism' ||
        fallback.style === 'custom' ||
        fallback.style === 'off'
        ? fallback.style
        : DEFAULT_SPACE_GLOW.style,
    color: normalizeHex(fallback.color, DEFAULT_SPACE_GLOW.color),
    intensity: clamp01(fallback.intensity, DEFAULT_SPACE_GLOW.intensity),
    speed: clamp01(fallback.speed, DEFAULT_SPACE_GLOW.speed),
    size: clamp01(fallback.size, DEFAULT_SPACE_GLOW.size),
  };

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return safeFallback;
  }

  const obj = raw as Record<string, unknown>;
  const style: SpaceGlowStyle =
    obj.style === 'theme' || obj.style === 'prism' || obj.style === 'custom' || obj.style === 'off'
      ? obj.style
      : safeFallback.style;

  return {
    style,
    color: normalizeHex(obj.color, safeFallback.color),
    intensity: clamp01(obj.intensity, safeFallback.intensity),
    speed: clamp01(obj.speed, safeFallback.speed),
    size: clamp01(obj.size, safeFallback.size),
  };
}

export function cloneSpaceTheme(theme: SpaceTheme): SpaceTheme {
  return {
    points: theme.points.map((p) => ({ color: p.color, x: p.x, y: p.y })),
    intensity: theme.intensity,
    grain: theme.grain,
    mode: theme.mode,
    glow: validateAndClampSpaceGlow(theme.glow, DEFAULT_SPACE_GLOW),
  };
}

export function validateAndClampSpaceTheme(raw: unknown, fallback: SpaceTheme = DEFAULT_SPACE_THEME): SpaceTheme {
  const safeFallback = cloneSpaceTheme(fallback);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return safeFallback;
  }

  const obj = raw as Record<string, unknown>;
  const mode: SpaceThemeMode =
    obj.mode === 'light' || obj.mode === 'dark' || obj.mode === 'auto' ? obj.mode : safeFallback.mode;
  const intensity = clamp01(obj.intensity, safeFallback.intensity);
  const grain = clamp01(obj.grain, safeFallback.grain);
  const glow = validateAndClampSpaceGlow(obj.glow, safeFallback.glow || DEFAULT_SPACE_GLOW);

  const rawPoints = Array.isArray(obj.points) ? obj.points : [];
  const validPoints: SpaceThemePoint[] = [];

  for (let i = 0; i < rawPoints.length && validPoints.length < 3; i++) {
    const item = rawPoints[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const pObj = item as Record<string, unknown>;
    const fbPoint = safeFallback.points[validPoints.length] || safeFallback.points[0];
    const hasValidColor = typeof pObj.color === 'string' && normalizeHex(pObj.color, '') !== '';
    const hasCoords = typeof pObj.x === 'number' && typeof pObj.y === 'number';
    if (!hasValidColor && !hasCoords) continue;

    const clampedPos = clampWheelPos(pObj.x, pObj.y, fbPoint.x, fbPoint.y);
    const color = hasValidColor
      ? normalizeHex(pObj.color, fbPoint.color)
      : colorAtWheelPos(clampedPos.x, clampedPos.y, mode === 'light' ? 76 : 42);
    const finalPos = hasCoords ? clampedPos : colorToWheelPos(color);

    validPoints.push({
      color,
      x: finalPos.x,
      y: finalPos.y,
    });
  }

  while (validPoints.length < 2) {
    const fbPoint = safeFallback.points[validPoints.length % safeFallback.points.length];
    validPoints.push({ ...fbPoint });
  }

  return {
    points: validPoints,
    intensity,
    grain,
    mode,
    glow,
  };
}

export function migrateLegacyThemeSettings(rawSettings: Record<string, unknown>): SpaceTheme {
  const legacyTheme = rawSettings.theme === 'light' ? 'light' : 'dark';
  const custom =
    rawSettings.customTheme !== null &&
      typeof rawSettings.customTheme === 'object' &&
      !Array.isArray(rawSettings.customTheme)
      ? (rawSettings.customTheme as Record<string, unknown>)
      : null;

  const customThemeId = typeof custom?.themeId === 'string' ? custom.themeId : '';
  const mode: SpaceThemeMode = customThemeId === 'clean-light' ? 'light' : legacyTheme;

  const rawAccent = typeof custom?.accent === 'string' ? normalizeHex(custom.accent, '') : '';
  if (rawAccent) {
    const { h, s } = hexToHsl(rawAccent);
    if (s >= 14) {
      const secondary = hslToHex((h + 34) % 360, Math.max(28, Math.min(88, s * 0.85)), mode === 'light' ? 78 : 34);
      const tertiary = hslToHex((h + 320) % 360, Math.max(22, Math.min(72, s * 0.7)), mode === 'light' ? 86 : 20);
      return {
        points: [makePoint(rawAccent), makePoint(secondary), makePoint(tertiary)],
        intensity: mode === 'light' ? 0.6 : 0.56,
        grain: 0.22,
        mode,
        glow: validateAndClampSpaceGlow(undefined),
      };
    }

    if (mode === 'light') {
      const preset = SPACE_THEME_PRESETS.find((p) => p.id === 'warm-linen')!;
      return cloneSpaceTheme(preset.theme);
    }

    const obs = SPACE_THEME_PRESETS.find((p) => p.id === 'obsidian-mono')!;
    return cloneSpaceTheme(obs.theme);
  }

  if (mode === 'light') {
    const preset = SPACE_THEME_PRESETS.find((p) => p.id === 'warm-linen')!;
    return cloneSpaceTheme(preset.theme);
  }

  return cloneSpaceTheme(DEFAULT_SPACE_THEME);
}

export function getDefaultSpaceTheme(spaceId: string, rawSettings?: Record<string, unknown>): SpaceTheme {
  if (rawSettings && (rawSettings.theme === 'light' || rawSettings.customTheme !== undefined)) {
    return migrateLegacyThemeSettings(rawSettings);
  }
  const presetId = SPACE_DEFAULT_PRESET_MAP[spaceId] || 'evergreen-mist';
  const preset = SPACE_THEME_PRESETS.find((p) => p.id === presetId) || SPACE_THEME_PRESETS[0];
  return cloneSpaceTheme(preset.theme);
}

export function normalizeSpaceThemesMap(
  rawMap: unknown,
  rawSettings?: Record<string, unknown>
): SpaceThemesMap {
  const result: SpaceThemesMap = {};
  if (rawMap !== null && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
    const entries = Object.entries(rawMap as Record<string, unknown>);
    for (const [spaceId, rawTheme] of entries) {
      if (!spaceId) continue;
      const fb = getDefaultSpaceTheme(spaceId, rawSettings);
      result[spaceId] = validateAndClampSpaceTheme(rawTheme, fb);
    }
  }
  return result;
}

export function resolveEffectiveMode(mode: SpaceThemeMode, osDark: boolean): 'light' | 'dark' {
  if (mode === 'auto') {
    return osDark ? 'dark' : 'light';
  }
  return mode;
}

function liftGlowColor(hex: string, effectiveMode: 'light' | 'dark'): string {
  const { h, s, l } = hexToHsl(hex);
  const targetMinL = effectiveMode === 'dark' ? 48 : 52;
  const targetMaxL = effectiveMode === 'dark' ? 68 : 74;
  const clampedL = Math.max(targetMinL, Math.min(targetMaxL, l));
  // Preserve subtle gray when monochrome, otherwise boost saturation cleanly so glow reads luminously
  const nextS = s < 10 ? Math.max(12, s) : Math.max(54, Math.min(92, s));
  return hslToHex(h, nextS, clampedL);
}

export function computeGlowStops(
  rawTheme: SpaceTheme,
  effectiveMode: 'light' | 'dark'
): { glowC1: string; glowC2: string; glowC3: string; glowC4: string; glow: SpaceGlowSettings } {
  const theme = validateAndClampSpaceTheme(rawTheme);
  const glow = validateAndClampSpaceGlow(theme.glow, DEFAULT_SPACE_GLOW);

  if (glow.style === 'prism') {
    return {
      glowC1: '#F59E0B',
      glowC2: '#F97316',
      glowC3: '#EC4899',
      glowC4: '#8B5CF6',
      glow,
    };
  }

  if (glow.style === 'custom') {
    const base = liftGlowColor(glow.color, effectiveMode);
    const { h, s, l } = hexToHsl(base);
    return {
      glowC1: base,
      glowC2: hslToHex((h + 24) % 360, Math.min(92, s + 4), Math.max(46, l - 4)),
      glowC3: hslToHex((h + 334) % 360, Math.min(90, Math.max(46, s)), Math.min(72, l + 4)),
      glowC4: hslToHex((h + 12) % 360, Math.min(95, s + 8), Math.min(76, l + 10)),
      glow,
    };
  }

  // 'theme' (and safe fallback when 'off') derives 4 luminous stops directly from Space points
  const g1 = liftGlowColor(theme.points[0].color, effectiveMode);
  const g2 = liftGlowColor(theme.points[1].color, effectiveMode);
  const g3 = theme.points[2]
    ? liftGlowColor(theme.points[2].color, effectiveMode)
    : liftGlowColor(hslToHex((hexToHsl(g1).h + 26) % 360, 68, 56), effectiveMode);
  const coreHsl = hexToHsl(mixHex(g1, g2, 0.5));
  const g4 = hslToHex(coreHsl.h, Math.min(94, coreHsl.s + 10), Math.min(76, Math.max(54, coreHsl.l + 10)));

  return {
    glowC1: g1,
    glowC2: g2,
    glowC3: g3,
    glowC4: g4,
    glow,
  };
}

export function computeThemePalette(rawTheme: SpaceTheme, osDark: boolean): ThemePalette {
  const theme = validateAndClampSpaceTheme(rawTheme);
  const effectiveMode = resolveEffectiveMode(theme.mode, osDark);
  const { glowC1, glowC2, glowC3, glowC4, glow } = computeGlowStops(theme, effectiveMode);

  const c1 = theme.points[0].color;
  const c2 = theme.points[1].color;
  const hasThirdPoint = theme.points.length >= 3;
  const c3 = hasThirdPoint ? theme.points[2].color : mixHex(c1, c2, 0.5);

  const baseBg = effectiveMode === 'dark' ? '#070908' : '#F7F5F0';
  const avgPoint = hasThirdPoint
    ? mixHex(mixHex(c1, c2, 0.5), c3, 0.34)
    : mixHex(c1, c2, 0.5);

  // Backdrop blooms scale smoothly with intensity so gradient shows richly without harsh clipping
  const backdropAlpha = 0.22 + theme.intensity * 0.72;
  const backdropC1 = mixHex(baseBg, c1, backdropAlpha);
  const backdropC2 = mixHex(baseBg, c2, backdropAlpha * 0.94);
  const backdropC3 = mixHex(baseBg, c3, backdropAlpha * 0.9);
  const bgAverage = mixHex(baseBg, avgPoint, 0.1 + theme.intensity * 0.64);

  const samples = [bgAverage, backdropC1, backdropC2];
  if (hasThirdPoint) {
    samples.push(backdropC3);
  }

  const lightFg = '#F8FAF9';
  const darkFg = '#101412';

  const worstContrast = (fgHex: string) =>
    samples.reduce((min, bg) => Math.min(min, contrastRatio(fgHex, bg)), Infinity);

  const lightWorst = worstContrast(lightFg);
  const darkWorst = worstContrast(darkFg);

  // Prefer the foreground polarity that yields higher worst-case contrast across the gradient
  const preferDarkInk = darkWorst >= lightWorst;
  const fg = preferDarkInk ? darkFg : lightFg;

  // Muted text also satisfies >= 4.5:1 against the solid surface and blended backdrop
  let fgMuted = preferDarkInk ? '#3F4A45' : '#C7D0CC';
  if (worstContrast(fgMuted) < 4.5) {
    fgMuted = mixHex(fg, avgPoint, 0.14);
    if (worstContrast(fgMuted) < 4.5) {
      fgMuted = fg;
    }
  }
  const fgFaint = mixHex(fg, avgPoint, 0.36);

  // Surface backing matches text polarity so overlays/pills/cards remain legible on any gradient
  const surfaceBase = preferDarkInk ? mixHex('#FFFFFF', avgPoint, 0.08) : mixHex('#0A0D0C', avgPoint, 0.16);
  const surfaceAlpha = preferDarkInk ? 0.82 : 0.72;
  const surface = rgbaString(surfaceBase, surfaceAlpha);
  const surfaceSolid = preferDarkInk ? mixHex('#FDFCFA', avgPoint, 0.06) : mixHex('#101413', avgPoint, 0.14);
  const surfaceHover = preferDarkInk ? rgbaString(surfaceBase, 0.92) : mixHex('#181E1C', avgPoint, 0.18);

  const bgApp = bgAverage;
  const bgSidebar = rgbaString(surfaceSolid, preferDarkInk ? 0.88 : 0.86);
  const bgCard = surfaceSolid;
  const bgInput = preferDarkInk ? 'rgba(16, 20, 18, 0.07)' : 'rgba(255, 255, 255, 0.08)';

  const border = preferDarkInk ? 'rgba(16, 20, 18, 0.12)' : 'rgba(255, 255, 255, 0.13)';
  const borderStrong = preferDarkInk ? 'rgba(16, 20, 18, 0.22)' : 'rgba(255, 255, 255, 0.22)';
  const borderSubtle = preferDarkInk ? 'rgba(16, 20, 18, 0.08)' : 'rgba(255, 255, 255, 0.08)';

  // Derive accent from primary gradient point while guaranteeing readability on surfaceSolid
  let accent = c1;
  if (contrastRatio(accent, surfaceSolid) < 3.2) {
    const { h, s } = hexToHsl(c1);
    accent = hslToHex(h, Math.max(s, 36), preferDarkInk ? 36 : 68);
  }
  const accentSoft = rgbaString(accent, preferDarkInk ? 0.14 : 0.2);
  const accentGlow = rgbaString(accent, preferDarkInk ? 0.22 : 0.32);

  const surfaceContrast = Math.min(
    contrastRatio(fg, surfaceSolid),
    contrastRatio(fgMuted, surfaceSolid)
  );
  const canvasContrast = Math.min(worstContrast(fg), surfaceContrast);

  return {
    effectiveMode,
    c1,
    c2,
    c3,
    hasThirdPoint,
    glowC1,
    glowC2,
    glowC3,
    glowC4,
    glowStyle: glow.style,
    glowIntensity: glow.intensity,
    glowSpeed: glow.speed,
    glowSize: glow.size,
    fg,
    fgMuted,
    fgFaint,
    surface,
    surfaceSolid,
    surfaceHover,
    bgApp,
    bgSidebar,
    bgCard,
    bgInput,
    border,
    borderStrong,
    borderSubtle,
    accent,
    accentSoft,
    accentGlow,
    backdropC1,
    backdropC2,
    backdropC3,
    minContrast: Number(canvasContrast.toFixed(2)),
  };
}

function rgbaString(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

