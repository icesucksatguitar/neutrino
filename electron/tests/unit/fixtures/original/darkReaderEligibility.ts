// Verbatim extraction of the UNFIXED DarkReader eligibility check and settings from the
// `dom-ready` handler in src/main/index.ts, taken before any task-3 source change:
//
//   if (url && !url.startsWith('neutrino://') && !url.startsWith('about:') && !isAuthOrSecurityUrl(url))
//   DarkReader.enable({ brightness: 100, contrast: 95, sepia: 0 })
//
// The renderer copy in BrowserViewport.syncDarkThemeForTab only skips `neutrino://` and
// `about:` (no auth check). The design makes the main-process check the single owner, so the
// main-process check is the baseline preserved here (3.6).
//
// Do not edit to follow the fix.

import { isAuthOrSecurityUrl } from './authUrl';

export const DARK_READER_SETTINGS = Object.freeze({ brightness: 100, contrast: 95, sepia: 0 });

/** True when the unfixed main process would inject and enable DarkReader for `url` in dark mode. */
export function originalIsDarkReaderEligible(url: string): boolean {
  return Boolean(url && !url.startsWith('neutrino://') && !url.startsWith('about:') && !isAuthOrSecurityUrl(url));
}

/** PDF detection from BrowserViewport.injectPdfViewerDarkTheme (unfixed). */
export function originalIsPdfUrl(u: string): boolean {
  return (
    u.toLowerCase().endsWith('.pdf') ||
    u.toLowerCase().includes('.pdf?') ||
    u.toLowerCase().includes('application/pdf')
  );
}

/** PDF dark style filter from BrowserViewport.injectPdfViewerDarkTheme (unfixed). */
export const PDF_DARK_FILTER = 'filter: invert(90%) hue-rotate(180deg) contrast(95%) !important;';
