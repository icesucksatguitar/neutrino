// Pure DarkReader rules for the main-process injector. No Electron import.

import { isHostExcluded } from './settings';
import { isAuthOrSecurityUrl } from './urlClassifier';

export const DARK_READER_SETTINGS = Object.freeze({ brightness: 100, contrast: 95, sepia: 0 });

/** Same base rules as before, minus hosts on the user's exclusion list. */
export function shouldInjectDarkReader(url: string, exclusions: readonly string[]): boolean {
  if (!url || url.startsWith('neutrino://') || url.startsWith('about:')) return false;
  if (isAuthOrSecurityUrl(url)) return false;
  return !isHostExcluded(url, exclusions);
}

/** CSS injected immediately at navigation commit to prevent a bright white flash before DarkReader initializes. */
export const INSTANT_DARK_PREPAINT_CSS = `
html:not([data-darkreader-mode]),
html:not([data-darkreader-mode]) body {
  color-scheme: dark !important;
  background-color: #181a1b !important;
  color: #e8e6e3 !important;
}
`;

// The settings literal in the enable script below must match DARK_READER_SETTINGS;
// tests/unit/preservation.test.ts scans the source for every DarkReader enable call and checks its values.

/** Runs in the page after the DarkReader library is loaded. */
export const DARK_READER_ENABLE_SCRIPT = `
  try {
    if (window.DarkReader && !window.__neutrino_darkreader_active) {
      DarkReader.setFetchMethod(function(url) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = controller ? setTimeout(function() { try { controller.abort(); } catch (err) {} }, 1200) : null;
        return window.fetch(url, {
          cache: 'force-cache',
          credentials: 'same-origin',
          signal: controller ? controller.signal : undefined
        }).finally(function() {
          if (timer !== null) clearTimeout(timer);
        });
      });
      DarkReader.enable({ brightness: 100, contrast: 95, sepia: 0 });
      window.__neutrino_darkreader_active = true;
    }
  } catch (e) {}
`;

/** Turns DarkReader off in the page without a reload. */
export const DARK_READER_DISABLE_SCRIPT = `
  try {
    if (window.DarkReader) {
      DarkReader.disable();
    }
    window.__neutrino_darkreader_active = false;
  } catch (e) {}
`;

/** Builds a single-roundtrip script that sets colorScheme, optionally loads DarkReader once, and enables it. */
export function buildDarkModeEnableScript(darkReaderCode: string, includeLibrary = true): string {
  const libraryBlock =
    includeLibrary && darkReaderCode
      ? `if (typeof window.DarkReader === 'undefined') {\n${darkReaderCode}\n}`
      : '';
  return `(() => {
    try {
      if (window.__neutrino_darkreader_active) return 'already-active';
      try {
        document.documentElement.style.colorScheme = 'dark';
        if (document.body) document.body.style.colorScheme = 'dark';
      } catch (e) {}
      ${libraryBlock}
      ${DARK_READER_ENABLE_SCRIPT}
      return 'enabled';
    } catch (e) {
      return 'error';
    }
  })();`;
}

/** Builds a single-roundtrip script that disables DarkReader and optionally resets light colorScheme. */
export function buildDarkModeDisableScript(restoreLightColorScheme = false): string {
  const lightBlock = restoreLightColorScheme
    ? `try {
        document.documentElement.style.colorScheme = 'light';
        if (document.body) document.body.style.colorScheme = 'light';
      } catch (e) {}`
    : '';
  return `(() => {
    try {
      ${DARK_READER_DISABLE_SCRIPT}
      ${lightBlock}
      return 'disabled';
    } catch (e) {
      return 'error';
    }
  })();`;
}
