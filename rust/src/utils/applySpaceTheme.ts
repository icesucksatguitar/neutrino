import {
  type SpaceTheme,
  type ThemePalette,
  computeThemePalette,
  validateAndClampSpaceTheme,
} from '../../main/spaceTheme';

export function getOsPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true;
  } catch {
    return true;
  }
}

function pointToBackdropPercent(value: number, minPct = 14, spanPct = 72): string {
  const clamped = Math.max(0, Math.min(1, value));
  return `${(minPct + clamped * spanPct).toFixed(1)}%`;
}

/**
 * Applies the active Space theme solely via root CSS custom properties and `data-theme`.
 * Components read these variables directly — zero per-component color calculation.
 */
export function applySpaceThemeToRoot(rawTheme: SpaceTheme, osDark: boolean): ThemePalette {
  const theme = validateAndClampSpaceTheme(rawTheme);
  const palette = computeThemePalette(theme, osDark);

  if (typeof document === 'undefined') {
    return palette;
  }

  const root = document.documentElement;
  const style = root.style;

  // Required root Space-theme tokens
  style.setProperty('--theme-c1', palette.c1);
  style.setProperty('--theme-c2', palette.c2);
  style.setProperty('--theme-c3', palette.c3);
  style.setProperty('--theme-intensity', theme.intensity.toFixed(3));
  style.setProperty('--theme-grain', theme.grain.toFixed(3));
  style.setProperty('--theme-fg', palette.fg);
  style.setProperty('--theme-surface', palette.surface);

  // Supporting Space-theme tokens for gradients, noise and contrast-safe surfaces
  style.setProperty('--theme-fg-muted', palette.fgMuted);
  style.setProperty('--theme-fg-faint', palette.fgFaint);
  style.setProperty(
    '--theme-fg-shadow',
    palette.effectiveMode === 'dark' ? '0 4px 28px rgba(0, 0, 0, 0.48)' : '0 1px 12px rgba(255, 255, 255, 0.28)'
  );
  style.setProperty('--theme-surface-solid', palette.surfaceSolid);
  style.setProperty('--theme-surface-hover', palette.surfaceHover);
  style.setProperty('--theme-bg-canvas', palette.bgApp);
  style.setProperty('--theme-backdrop-c1', palette.backdropC1);
  style.setProperty('--theme-backdrop-c2', palette.backdropC2);
  style.setProperty(
    '--theme-backdrop-c3',
    palette.hasThirdPoint ? palette.backdropC3 : 'transparent'
  );
  style.setProperty('--theme-p1-x', pointToBackdropPercent(theme.points[0].x));
  style.setProperty('--theme-p1-y', pointToBackdropPercent(theme.points[0].y));
  style.setProperty('--theme-p2-x', pointToBackdropPercent(theme.points[1].x));
  style.setProperty('--theme-p2-y', pointToBackdropPercent(theme.points[1].y));
  style.setProperty(
    '--theme-p3-x',
    pointToBackdropPercent(theme.points[2] ? theme.points[2].x : 0.5)
  );
  style.setProperty(
    '--theme-p3-y',
    pointToBackdropPercent(theme.points[2] ? theme.points[2].y : 0.5)
  );
  style.setProperty('--theme-grain-opacity', (theme.grain * 0.14).toFixed(4));
  style.setProperty('--theme-ambient-opacity', (0.06 + theme.intensity * 0.24).toFixed(3));

  // Customizable animated Homescreen ambient glow tokens
  const isOff = palette.glowStyle === 'off' || palette.glowIntensity <= 0.005;
  const glowOpacity = isOff
    ? 0
    : palette.effectiveMode === 'dark'
      ? 0.08 + palette.glowIntensity * 0.58
      : 0.06 + palette.glowIntensity * 0.36;
  const glowWidthPx = Math.round(620 + palette.glowSize * 640);
  const glowHeightPx = Math.round(360 + palette.glowSize * 340);
  // Radial gradients are already multi-stop feathered; capping CSS blur avoids huge offscreen GPU buffers.
  const glowBlurPx = Math.round(12 + palette.glowSize * 20);
  const isPaused = isOff || palette.glowSpeed <= 0.01;
  // Higher speed slider -> faster duration (1.75x slower at min speed, 0.45x faster at max speed)
  const durationFactor = 1.75 - palette.glowSpeed * 1.3;

  style.setProperty('--glow-c1', palette.glowC1);
  style.setProperty('--glow-c2', palette.glowC2);
  style.setProperty('--glow-c3', palette.glowC3);
  style.setProperty('--glow-c4', palette.glowC4);
  style.setProperty('--glow-opacity', glowOpacity.toFixed(3));
  style.setProperty('--glow-blend-mode', palette.effectiveMode === 'dark' ? 'screen' : 'normal');
  style.setProperty('--glow-size', `${glowWidthPx}px`);
  style.setProperty('--glow-height', `${glowHeightPx}px`);
  style.setProperty('--glow-blur', `${glowBlurPx}px`);
  style.setProperty('--glow-play-state', isPaused ? 'paused' : 'running');
  style.setProperty('--glow-speed', `${(20 * durationFactor).toFixed(1)}s`);
  style.setProperty('--glow-drift-speed-1', `${(13 * durationFactor).toFixed(1)}s`);
  style.setProperty('--glow-drift-speed-2', `${(17 * durationFactor).toFixed(1)}s`);
  style.setProperty('--glow-drift-speed-3', `${(11 * durationFactor).toFixed(1)}s`);
  style.setProperty('--glow-drift-speed-4', `${(15 * durationFactor).toFixed(1)}s`);

  style.setProperty('--theme-border', palette.border);
  style.setProperty('--theme-border-strong', palette.borderStrong);
  style.setProperty('--theme-border-subtle', palette.borderSubtle);
  style.setProperty('--theme-accent', palette.accent);
  style.setProperty('--theme-accent-soft', palette.accentSoft);
  style.setProperty('--theme-accent-glow', palette.accentGlow);

  // Core Neutrino UI tokens harmonized with active Space palette
  style.setProperty('--bg', palette.bgApp);
  style.setProperty('--bg-app', palette.bgApp);
  style.setProperty('--bg-elevated', palette.surfaceSolid);
  style.setProperty('--bg-sidebar', palette.bgSidebar);
  style.setProperty('--bg-sidebar-hover', palette.surfaceHover);
  style.setProperty('--bg-surface', palette.surfaceSolid);
  style.setProperty('--bg-card', palette.bgCard);
  style.setProperty('--bg-input', palette.bgInput);
  style.setProperty('--surface', palette.surface);
  style.setProperty('--surface-solid', palette.surfaceSolid);
  style.setProperty('--surface-hover', palette.surfaceHover);
  style.setProperty('--text', palette.fg);
  style.setProperty('--text-main', palette.fg);
  style.setProperty('--text-muted', palette.fgMuted);
  style.setProperty('--text-faint', palette.fgFaint);
  style.setProperty('--border', palette.border);
  style.setProperty('--border-strong', palette.borderStrong);
  style.setProperty('--border-subtle', palette.borderSubtle);
  style.setProperty('--border-focus', palette.fg);
  style.setProperty('--accent', palette.accent);
  style.setProperty('--accent-hover', palette.fg);
  style.setProperty('--accent-active', palette.fgMuted);
  style.setProperty('--accent-soft', palette.accentSoft);
  style.setProperty('--accent-glow', `0 0 20px ${palette.accentGlow}`);
  style.setProperty('--workspace-accent', palette.accent);

  root.setAttribute('data-theme', palette.effectiveMode);
  root.setAttribute('data-glow-style', isOff ? 'off' : palette.glowStyle);
  if (document.body) {
    document.body.classList.toggle('dark-mode', palette.effectiveMode === 'dark');
  }

  return palette;
}

