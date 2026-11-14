import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  blend,
  computeTopBarTint,
  isInternalPageUrl,
  type TabPageColor,
} from '../../../src/renderer/utils/topBarTint';
import { contrastRatio, parseCssColor, MIN_CONTRAST, type Rgba } from '../../../src/main/topbar/color';
import { dominantBitmapColor } from '../../../src/main/topbar/sample';

const report = (p: Partial<TabPageColor> = {}): TabPageColor => ({
  tabId: 't1',
  themeColor: null,
  sampled: null,
  ...p,
});

const base = { activeTabId: 't1', activeTabUrl: 'https://example.com/' };

describe('isInternalPageUrl', () => {
  it('treats neutrino://, about: and missing URLs as internal', () => {
    expect(isInternalPageUrl('neutrino://newtab')).toBe(true);
    expect(isInternalPageUrl('NEUTRINO://settings')).toBe(true);
    expect(isInternalPageUrl('about:blank')).toBe(true);
    expect(isInternalPageUrl(undefined)).toBe(true);
    expect(isInternalPageUrl('')).toBe(true);
    expect(isInternalPageUrl('https://github.com')).toBe(false);
  });
});

describe('computeTopBarTint', () => {
  it('uses the theme-color with a readable foreground (R20.1, R20.4)', () => {
    const t = computeTopBarTint({ ...base, report: report({ themeColor: '#24292f', sampled: { r: 255, g: 255, b: 255, a: 1 } }) });
    expect(t?.source).toBe('theme-color');
    expect(t?.vars['--topbar-tint-bg']).toBe('#24292f');
    expect(t?.vars['--topbar-tint-fg']).toBe('#ffffff');
    expect(t?.vars['--theme-fg']).toBe('#ffffff');
  });

  it('falls back to the sampled color when theme-color is missing or invalid (R20.2)', () => {
    const sampled = { r: 250, g: 240, b: 200, a: 1 };
    for (const themeColor of [null, 'not-a-color', 'transparent']) {
      const t = computeTopBarTint({ ...base, report: report({ themeColor, sampled }) });
      expect(t?.source).toBe('sampled');
      expect(t?.vars['--topbar-tint-bg']).toBe('#faf0c8');
      expect(t?.vars['--topbar-tint-fg']).toBe('#000000');
    }
  });

  it('returns null (default theme) for internal pages and undeterminable colors (R20.5, R20.6)', () => {
    const r = report({ themeColor: '#ff0000' });
    expect(computeTopBarTint({ ...base, activeTabUrl: 'neutrino://newtab', report: r })).toBeNull();
    expect(computeTopBarTint({ ...base, activeTabUrl: 'neutrino://settings', report: r })).toBeNull();
    expect(computeTopBarTint({ ...base, activeTabIsSleeping: true, report: r })).toBeNull();
    expect(computeTopBarTint({ ...base, report: report() })).toBeNull();
    expect(computeTopBarTint({ ...base, report: null })).toBeNull();
  });

  it('ignores stale reports for a tab that is no longer active', () => {
    const r = report({ tabId: 'old', themeColor: '#ff0000' });
    expect(computeTopBarTint({ ...base, report: r })).toBeNull();
    expect(computeTopBarTint({ ...base, activeTabId: undefined, report: r })).toBeNull();
  });

  it('does not tint while the page is in HTML fullscreen', () => {
    const r = report({ themeColor: '#ff0000' });
    expect(computeTopBarTint({ ...base, report: r, suppressed: true })).toBeNull();
  });

  it('picks up a changed theme-color for the same tab (R20.7)', () => {
    const a = computeTopBarTint({ ...base, report: report({ themeColor: '#000080' }) });
    const b = computeTopBarTint({ ...base, report: report({ themeColor: '#ffd700' }) });
    expect(a?.vars['--topbar-tint-bg']).toBe('#000080');
    expect(b?.vars['--topbar-tint-bg']).toBe('#ffd700');
  });
});

const rgbArb = fc.record({
  r: fc.integer({ min: 0, max: 255 }),
  g: fc.integer({ min: 0, max: 255 }),
  b: fc.integer({ min: 0, max: 255 }),
  a: fc.constant(1),
});

describe('computeTopBarTint properties', () => {
  // **Validates: Requirements 20.4**
  it('text colors keep >= 4.5:1 contrast on the bar and on every chip surface', () => {
    fc.assert(
      fc.property(rgbArb, fc.boolean(), (color, asThemeColor) => {
        const hex = `#${[color.r, color.g, color.b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
        const t = computeTopBarTint({
          ...base,
          report: report(asThemeColor ? { themeColor: hex } : { sampled: color }),
        });
        expect(t).not.toBeNull();
        const v = t!.vars;
        const surfaces = ['--topbar-tint-bg', '--theme-surface', '--theme-surface-hover', '--bg-input'].map(
          (k) => parseCssColor(v[k]) as Rgba,
        );
        for (const text of ['--topbar-tint-fg', '--theme-fg', '--theme-fg-muted']) {
          for (const s of surfaces) {
            expect(contrastRatio(v[text], s)).toBeGreaterThanOrEqual(MIN_CONTRAST);
          }
        }
        // Active tabs pill: --theme-surface-solid text on a --theme-fg background.
        expect(contrastRatio(v['--theme-surface-solid'], v['--theme-fg'])).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }),
      { numRuns: 300 },
    );
  });
});

describe('blend', () => {
  it('interpolates channels and clamps t', () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(blend(black, white, 0.5)).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    expect(blend(black, white, 2)).toEqual(white);
    expect(blend(black, white, -1)).toEqual(black);
  });
});

/** Builds a BGRA bitmap from per-pixel [r, g, b, a]. */
function bgra(pixels: Array<[number, number, number, number]>): Uint8Array {
  const out = new Uint8Array(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => out.set([b, g, r, a], i * 4));
  return out;
}

describe('dominantBitmapColor', () => {
  it('returns the dominant color of a BGRA strip, ignoring small details', () => {
    const px: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 16; i++) px.push(i < 12 ? [36, 41, 47, 255] : [255, 255, 255, 255]);
    expect(dominantBitmapColor(bgra(px), 8, 2, 'bgra')).toEqual({ r: 36, g: 41, b: 47, a: 1 });
  });

  it('reads RGBA order when asked', () => {
    const buf = new Uint8Array([10, 20, 30, 255, 10, 20, 30, 255]);
    expect(dominantBitmapColor(buf, 2, 1, 'rgba')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
  });

  it('returns null for transparent, mismatched or too busy strips', () => {
    expect(dominantBitmapColor(bgra([[0, 0, 0, 0], [9, 9, 9, 10]]), 2, 1)).toBeNull();
    expect(dominantBitmapColor(new Uint8Array(12), 2, 2)).toBeNull();
    expect(dominantBitmapColor(new Uint8Array(0), 0, 0)).toBeNull();
    const busy: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 10; i++) busy.push([i * 25, (i * 77) % 256, (i * 131) % 256, 255]);
    expect(dominantBitmapColor(bgra(busy), 10, 1)).toBeNull();
  });
});
