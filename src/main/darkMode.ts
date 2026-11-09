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

// The settings literal in the enable script below must match DARK_READER_SETTINGS;
// tests/unit/preservation.test.ts scans the source for every DarkReader enable call and checks its values.

/** Runs in the page after the DarkReader library is loaded. */
export const DARK_READER_ENABLE_SCRIPT = `
  try {
    if (window.DarkReader) {
      DarkReader.setFetchMethod(window.fetch);
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
