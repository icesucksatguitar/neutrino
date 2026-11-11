import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPACE_THEME,
  SPACE_THEME_PRESETS,
  clampWheelPos,
  computeThemePalette,
  contrastRatio,
  getDefaultSpaceTheme,
  hexLuminance,
  hueSatToWheelPos,
  migrateLegacyThemeSettings,
  normalizeHex,
  normalizeSpaceThemesMap,
  validateAndClampSpaceTheme,
  wheelPosToHueSat,
} from '../../src/main/spaceTheme';
import { normalizeSettings, resolveSpaceTheme } from '../../src/main/settings';

describe('spaceTheme: wheel math', () => {
  it('maps center (0.5, 0.5) to saturation 0', () => {
    const res = wheelPosToHueSat(0.5, 0.5);
    expect(res.saturation).toBe(0);
    expect(hueSatToWheelPos(180, 0)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('round-trips angle/radius (hue/saturation) and (x/y) accurately across quadrants', () => {
    const cases = [
      { hue: 0, sat: 100 },
      { hue: 45, sat: 75 },
      { hue: 90, sat: 50 },
      { hue: 135, sat: 82 },
      { hue: 180, sat: 60 },
      { hue: 225, sat: 90 },
      { hue: 270, sat: 40 },
      { hue: 315, sat: 15 },
    ];

    for (const { hue, sat } of cases) {
      const pos = hueSatToWheelPos(hue, sat);
      const dist = Math.hypot(pos.x - 0.5, pos.y - 0.5);
      expect(dist).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(1);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeLessThanOrEqual(1);

      const roundTrip = wheelPosToHueSat(pos.x, pos.y);
      const hueDiff = Math.min(Math.abs(roundTrip.hue - hue), 360 - Math.abs(roundTrip.hue - hue));
      expect(hueDiff).toBeLessThan(1e-6);
      expect(Math.abs(roundTrip.saturation - sat)).toBeLessThan(1e-6);
    }
  });

  it('clamps corner coordinates onto the wheel unit circle', () => {
    const corners = [
      [0, 0],
      [1, 1],
      [-3, 2],
      [1, 0],
    ] as const;

    for (const [x, y] of corners) {
      const clamped = clampWheelPos(x, y);
      const radius = Math.hypot(clamped.x - 0.5, clamped.y - 0.5);
      expect(radius).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(clamped.x).toBeGreaterThanOrEqual(0);
      expect(clamped.x).toBeLessThanOrEqual(1);
      expect(clamped.y).toBeGreaterThanOrEqual(0);
      expect(clamped.y).toBeLessThanOrEqual(1);
    }
  });
});

describe('spaceTheme: validation and clamping', () => {
  it('provides at least 8 presets including a deep-green homescreen preset', () => {
    expect(SPACE_THEME_PRESETS.length).toBeGreaterThanOrEqual(8);
    const evergreen = SPACE_THEME_PRESETS.find((p) => p.id === 'evergreen-mist');
    expect(evergreen).toBeDefined();
    expect(evergreen?.theme.mode).toBe('dark');
    expect(evergreen?.theme.points.length).toBeGreaterThanOrEqual(2);
  });

  it('clamps out-of-range intensity, grain, coordinates, invalid hex, and point counts', () => {
    const validated = validateAndClampSpaceTheme({
      points: [
        { color: '#abc', x: 5, y: 5 },
        { color: 'bad-hex', x: -2, y: 0.5 },
        { color: '#112233', x: 0.9, y: 0.9 },
        { color: '#445566', x: 0.2, y: 0.2 },
      ],
      intensity: 4.5,
      grain: -0.7,
      mode: 'invalid-mode',
    });

    expect(validated.intensity).toBe(1);
    expect(validated.grain).toBe(0);
    expect(validated.mode).toBe(DEFAULT_SPACE_THEME.mode);
    expect(validated.points).toHaveLength(3);
    expect(validated.points[0].color).toBe('#AABBCC');
    expect(normalizeHex(validated.points[1].color, '')).toMatch(/^#[0-9A-F]{6}$/);
    for (const pt of validated.points) {
      expect(Math.hypot(pt.x - 0.5, pt.y - 0.5)).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });

  it('pads missing or <2 points safely from fallback', () => {
    const single = validateAndClampSpaceTheme({
      points: [{ color: '#ff5500', x: 0.7, y: 0.5 }],
      intensity: Number.NaN,
      grain: Number.POSITIVE_INFINITY,
      mode: 'light',
    });

    expect(single.points).toHaveLength(2);
    expect(single.points[0].color).toBe('#FF5500');
    expect(single.intensity).toBe(DEFAULT_SPACE_THEME.intensity);
    expect(single.grain).toBe(DEFAULT_SPACE_THEME.grain);
    expect(single.mode).toBe('light');

    const corrupt = validateAndClampSpaceTheme(null);
    expect(corrupt).toEqual(DEFAULT_SPACE_THEME);
  });
});

describe('spaceTheme: legacy migration', () => {
  it('migrates legacy light/customTheme settings cleanly into SpaceTheme', () => {
    const migratedLight = migrateLegacyThemeSettings({
      theme: 'light',
      customTheme: { themeId: 'clean-light', accent: '#38bdf8' },
    });

    expect(migratedLight.mode).toBe('light');
    expect(migratedLight.points[0].color).toBe('#38BDF8');
    expect(migratedLight.points.length).toBeGreaterThanOrEqual(2);

    const normalized = normalizeSettings({
      theme: 'light',
      customTheme: { themeId: 'clean-light', accent: '#10b981' },
    });
    expect(normalized.spaceThemes?.['space-study']?.mode).toBe('light');
    expect(normalized.spaceThemes?.['space-study']?.points[0].color).toBe('#10B981');
    expect(normalized.spaceThemes?.['space-work']?.mode).toBe('light');
  });

  it('fills safe per-Space defaults for old settings files without spaceThemes', () => {
    const oldSettings = normalizeSettings({ searchEngine: 'duckduckgo', adblockEnabled: true });
    expect(oldSettings.spaceThemes?.['space-study']).toBeDefined();
    expect(oldSettings.spaceThemes?.['space-work']).toBeDefined();
    expect(oldSettings.spaceThemes?.['space-leisure']).toBeDefined();
    expect(oldSettings.spaceThemes?.['space-study']).toEqual(getDefaultSpaceTheme('space-study'));
  });
});

describe('spaceTheme: luminance, auto mode, and contrast', () => {
  it('computes WCAG luminance and contrast ratios accurately', () => {
    expect(hexLuminance('#000000')).toBeCloseTo(0, 6);
    expect(hexLuminance('#FFFFFF')).toBeCloseTo(1, 6);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });

  it('maintains >= 4.5:1 foreground contrast on dark, light, and high-brightness gradients', () => {
    for (const preset of SPACE_THEME_PRESETS) {
      const pDark = computeThemePalette(preset.theme, true);
      const pLight = computeThemePalette(preset.theme, false);
      expect(pDark.minContrast).toBeGreaterThanOrEqual(4.5);
      expect(pLight.minContrast).toBeGreaterThanOrEqual(4.5);
    }

    // Extreme bright gradient even when mode is set to 'dark': switches fg token dynamically
    const brightTheme = validateAndClampSpaceTheme({
      points: [
        { color: '#FFF566', x: 0.3, y: 0.7 },
        { color: '#FFFFFF', x: 0.7, y: 0.3 },
      ],
      intensity: 1,
      grain: 0.1,
      mode: 'dark',
    });
    const adaptedPalette = computeThemePalette(brightTheme, true);
    expect(adaptedPalette.minContrast).toBeGreaterThanOrEqual(4.5);
    expect(hexLuminance(adaptedPalette.fg)).toBeLessThan(0.1);
  });

  it('resolves auto mode dynamically based on OS dark/light state', () => {
    const autoTheme = validateAndClampSpaceTheme({
      points: [
        { color: '#1D4ED8', x: 0.8, y: 0.5 },
        { color: '#0EA5E9', x: 0.7, y: 0.8 },
      ],
      intensity: 0.6,
      grain: 0.2,
      mode: 'auto',
    });

    expect(computeThemePalette(autoTheme, true).effectiveMode).toBe('dark');
    expect(computeThemePalette(autoTheme, false).effectiveMode).toBe('light');
  });
});

describe('spaceTheme: per-Space isolation', () => {
  it('editing one Space theme does not alter any other Space', () => {
    const initial = normalizeSettings({});
    const workBefore = resolveSpaceTheme(initial, 'space-work');
    const leisureBefore = resolveSpaceTheme(initial, 'space-leisure');

    const editedStudy = validateAndClampSpaceTheme({
      points: [
        { color: '#E11D48', x: 0.9, y: 0.5 },
        { color: '#FB923C', x: 0.8, y: 0.7 },
      ],
      intensity: 0.88,
      grain: 0.64,
      mode: 'light',
    });

    const updated = normalizeSettings({
      ...initial,
      spaceThemes: {
        ...(initial.spaceThemes || {}),
        'space-study': editedStudy,
      },
    });

    expect(resolveSpaceTheme(updated, 'space-study')).toEqual(editedStudy);
    expect(resolveSpaceTheme(updated, 'space-work')).toEqual(workBefore);
    expect(resolveSpaceTheme(updated, 'space-leisure')).toEqual(leisureBefore);

    const validatedMap = normalizeSpaceThemesMap(updated.spaceThemes);
    expect(validatedMap['space-study']).toEqual(editedStudy);
    expect(validatedMap['space-work']).toEqual(workBefore);
  });
});

