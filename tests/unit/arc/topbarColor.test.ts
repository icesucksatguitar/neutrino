import { describe, it, expect } from 'vitest';
import {
  parseCssColor,
  resolvePageColor,
  relativeLuminance,
  contrastRatio,
  pickForeground,
  toCssHex,
  MIN_CONTRAST,
  BLACK,
  WHITE,
} from '../../../src/main/topbar/color';

describe('parseCssColor', () => {
  it('parses hex 3/4/6/8 digits', () => {
    expect(parseCssColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 0x88 / 255 });
    expect(parseCssColor('#1A2b3C')).toEqual({ r: 26, g: 43, b: 60, a: 1 });
    expect(parseCssColor('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 });
  });

  it('parses rgb/rgba in comma and space syntax', () => {
    expect(parseCssColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseCssColor('rgba(10,20,30,0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseCssColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseCssColor('rgb(100%, 0%, 50%)')).toEqual({ r: 255, g: 0, b: 128, a: 1 });
  });

  it('parses hsl/hsla', () => {
    expect(parseCssColor('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor('hsla(120, 100%, 25%, 0.4)')).toEqual({ r: 0, g: 128, b: 0, a: 0.4 });
    expect(parseCssColor('hsl(240deg 100% 50%)')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(parseCssColor('hsl(0.5turn 100% 50%)')).toEqual({ r: 0, g: 255, b: 255, a: 1 });
  });

  it('parses basic named colors case-insensitively', () => {
    expect(parseCssColor('White')).toEqual(WHITE);
    expect(parseCssColor(' navy ')).toEqual({ r: 0, g: 0, b: 128, a: 1 });
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('rejects invalid values', () => {
    for (const bad of ['', '#ff', '#12345', '#ggg', 'rgb(1,2)', 'rgb(1 2 3 4)', 'hsl(0, 50, 50)', 'notacolor', 'url(x)']) {
      expect(parseCssColor(bad)).toBeNull();
    }
    expect(parseCssColor(null)).toBeNull();
    expect(parseCssColor(42)).toBeNull();
  });
});

describe('resolvePageColor', () => {
  it('uses default theme colors on internal pages even when a color exists (R20.5)', () => {
    expect(resolvePageColor('#123456', '#abcdef', true)).toEqual({ source: 'default' });
  });

  it('prefers a valid theme-color (R20.1)', () => {
    expect(resolvePageColor('#123456', '#abcdef', false)).toEqual({
      source: 'theme-color',
      color: { r: 0x12, g: 0x34, b: 0x56, a: 1 },
    });
  });

  it('falls back to the sampled color when theme-color is missing or invalid (R20.2)', () => {
    const expected = { source: 'sampled', color: { r: 0xab, g: 0xcd, b: 0xef, a: 1 } };
    expect(resolvePageColor(null, '#abcdef', false)).toEqual(expected);
    expect(resolvePageColor('bogus', '#abcdef', false)).toEqual(expected);
    expect(resolvePageColor('transparent', { r: 0xab, g: 0xcd, b: 0xef, a: 1 }, false)).toEqual(expected);
  });

  it('uses default when no color can be determined (R20.6)', () => {
    expect(resolvePageColor(undefined, undefined, false)).toEqual({ source: 'default' });
    expect(resolvePageColor('', 'nope', false)).toEqual({ source: 'default' });
  });

  it('returns an opaque color', () => {
    const r = resolvePageColor('rgba(10, 20, 30, 0.3)', null, false);
    expect(r).toEqual({ source: 'theme-color', color: { r: 10, g: 20, b: 30, a: 1 } });
  });
});

describe('luminance and contrast', () => {
  it('matches WCAG reference values', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance('#fff')).toBeCloseTo(1, 10);
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#777', '#fff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#abc', '#abc')).toBe(1);
  });
});

describe('pickForeground', () => {
  it('picks white on dark and black on light backgrounds', () => {
    expect(pickForeground('#111')).toEqual(WHITE);
    expect(pickForeground('#f5f5f5')).toEqual(BLACK);
    expect(toCssHex(pickForeground('navy'))).toBe('#ffffff');
  });

  it('meets 4.5:1 at the hardest mid-gray backgrounds (R20.4)', () => {
    for (let v = 0; v <= 255; v++) {
      const bg = { r: v, g: v, b: v, a: 1 };
      expect(contrastRatio(pickForeground(bg), bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});
