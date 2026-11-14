// Dia-style top bar tint glue (R20): page color inputs -> CSS variable values for the
// top bar, or null when the top bar keeps the default theme colors. Pure: no DOM access.
//
// The returned variables are set inline on the top bar element. They re-scope the theme
// variables its children already read (--theme-surface, --theme-fg, --border, ...), so the
// buttons, URL pill and tabs pill follow the tint without per-component styles. With no
// inline variables the top bar falls back to the Space theme (R20.5, R20.6, R21.12).

import {
  BLACK,
  MIN_CONTRAST,
  WHITE,
  contrastRatio,
  pickForeground,
  resolvePageColor,
  toCssHex,
  type Rgba,
} from '../../main/topbar/color';

/** What the viewport reports for a tab: its `theme-color` meta value and the sampled top color. */
export interface PageColorReport {
  themeColor: string | null;
  sampled: Rgba | null;
}

/** A report together with the tab it was taken from. */
export interface TabPageColor extends PageColorReport {
  tabId: string;
}

export interface TopBarTintInput {
  activeTabId: string | null | undefined;
  activeTabUrl: string | null | undefined;
  activeTabIsSleeping?: boolean;
  /** The last page color report, possibly for another tab. */
  report: TabPageColor | null;
  /** True while the page is in HTML fullscreen (or otherwise covered); the top bar is not tinted. */
  suppressed?: boolean;
}

export interface TopBarTint {
  source: 'theme-color' | 'sampled';
  background: Rgba;
  foreground: Rgba;
  /** CSS custom properties for the top bar element's inline style. */
  vars: Record<string, string>;
}

/** Internal pages (neutrino://, about:blank) and tabs without a page draw the default theme. */
export function isInternalPageUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.trim().toLowerCase();
  return u === '' || u.startsWith('neutrino://') || u.startsWith('about:');
}

/** Linear sRGB-space blend from `a` toward `b` by t (0..1). */
export function blend(a: Rgba, b: Rgba, t: number): Rgba {
  const k = Math.min(1, Math.max(0, t));
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k);
  return { r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b), a: 1 };
}

const rgba = (c: Rgba, alpha = 1): string => `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;

/** Chip surfaces move away from the foreground, so text on them keeps at least the base contrast. */
const SURFACE_T = 0.14;
const SURFACE_HOVER_T = 0.24;
const MUTED_T = 0.28;

/**
 * Decide the top bar colors. Returns null (default theme) when:
 * the report is for a tab that is no longer active (stale), the page is internal or sleeping,
 * the tint is suppressed (HTML fullscreen), or no usable color was found.
 * Otherwise the background is the theme-color, else the sampled color (R20.1, R20.2), and the
 * foreground is black or white with contrast >= 4.5:1 (R20.4).
 */
export function computeTopBarTint(input: TopBarTintInput): TopBarTint | null {
  const { activeTabId, activeTabUrl, activeTabIsSleeping, report, suppressed } = input;
  if (suppressed || !activeTabId || !report || report.tabId !== activeTabId) return null;
  const internal = isInternalPageUrl(activeTabUrl) || Boolean(activeTabIsSleeping);
  const resolved = resolvePageColor(report.themeColor, report.sampled, internal);
  if (resolved.source === 'default') return null;

  const bg = resolved.color;
  const fg = pickForeground(bg);
  const away = fg.r === 0 ? WHITE : BLACK;
  const surface = blend(bg, away, SURFACE_T);
  const surfaceHover = blend(bg, away, SURFACE_HOVER_T);
  // Muted text is a softer foreground only when it still meets the contrast floor on every surface.
  const mutedCandidate = blend(fg, bg, MUTED_T);
  const muted = [bg, surface, surfaceHover].every((s) => contrastRatio(mutedCandidate, s) >= MIN_CONTRAST)
    ? mutedCandidate
    : fg;

  const vars: Record<string, string> = {
    '--topbar-tint-bg': toCssHex(bg),
    '--topbar-tint-fg': toCssHex(fg),
    '--theme-fg': toCssHex(fg),
    '--theme-fg-muted': toCssHex(muted),
    '--theme-surface': toCssHex(surface),
    '--theme-surface-hover': toCssHex(surfaceHover),
    '--theme-surface-solid': toCssHex(away),
    '--bg-input': toCssHex(surfaceHover),
    '--border': rgba(fg, 0.12),
    '--border-strong': rgba(fg, 0.18),
    '--border-focus': rgba(fg, 0.32),
  };
  return { source: resolved.source, background: bg, foreground: fg, vars };
}
