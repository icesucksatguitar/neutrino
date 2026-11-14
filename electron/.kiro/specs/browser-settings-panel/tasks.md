# Implementation Plan: Browser Settings Panel

## Overview

Build the pure settings and dark-mode modules first, wire them into the main process (storage, shields, Zen, single DarkReader injector, IPC), then add the renderer panel and hook it into the top bar, Command Bar and Shield modal. All code is TypeScript. Tests use the existing vitest and fast-check setup (`npm test`, which runs `vitest --run`).

## Tasks

- [x] 1. Pure settings and dark-mode modules
  - [x] 1.1 Create `src/main/settings.ts`, `src/main/urlClassifier.ts` and `src/main/darkMode.ts`
    - `settings.ts` (no Electron import): `SearchEngineId`, `SEARCH_ENGINES`, `BrowserSettings`, `DEFAULT_SETTINGS` (`darkModeExclusions: ['youtube.com']`, `adblockEnabled: true`, `zenSleepEnabled: true`, `searchEngine: 'google'`), `normalizeSettings`, `normalizeHostEntry`, `hostMatches`, `isHostExcluded`, `hostForExclusion`, `addExclusion`, `removeExclusion`, `toggleSiteExclusion`, `buildSearchUrl`, following the rules in the design (legacy Google URL maps to `'google'`, an explicitly empty saved list stays empty, unknown keys are kept)
    - `urlClassifier.ts`: move `isGoogleAuthUrl` and `isAuthOrSecurityUrl` verbatim from `src/main/index.ts`; import and re-export them from `index.ts`
    - `darkMode.ts`: `DARK_READER_SETTINGS`, `shouldInjectDarkReader(url, exclusions)`, `DARK_READER_ENABLE_SCRIPT` (contains the literal `DarkReader.enable({ brightness: 100, contrast: 95, sepia: 0 })`) and `DARK_READER_DISABLE_SCRIPT`
    - _Requirements: 2.2, 2.3, 2.5, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 4.3, 5.7_

  - [x] 1.2 Write property test for settings normalization in `tests/unit/settings.test.ts`
    - **Property 1: Settings normalization is total, keeps valid data and is idempotent**
    - Also cover the examples: default list, explicitly empty list, legacy search URL
    - **Validates: Requirements 2.2, 2.3, 2.5**

  - [x] 1.3 Write property test for exclusion entry normalization in `tests/unit/settings.test.ts`
    - **Property 2: Exclusion entries normalize to one canonical hostname**
    - **Validates: Requirements 3.2, 3.3**

  - [x] 1.4 Write property test for add, remove and toggle in `tests/unit/settings.test.ts`
    - **Property 3: Add, remove and toggle are inverse operations**
    - Include `hostForExclusion` returning null for `neutrino://`, `about:`, `file:` and `chrome:` URLs
    - **Validates: Requirements 3.4, 4.3, 4.4**

  - [x] 1.5 Write property test for the DarkReader decision in `tests/unit/darkMode.test.ts`
    - **Property 4: Host_Match decides DarkReader injection and nothing else changes**
    - Compare against `originalIsDarkReaderEligible` from `tests/unit/fixtures/original/darkReaderEligibility.ts`; include lookalike hosts such as `notyoutube.com`
    - **Validates: Requirements 3.6, 3.9**

  - [x] 1.6 Write property test for search URLs in `tests/unit/settings.test.ts`
    - **Property 5: Search URLs round-trip the query**
    - **Validates: Requirements 5.7**

- [x] 2. Main-process wiring
  - [x] 2.1 Add `saveSettings` to storage and an auto-sleep switch to the Zen manager
    - `LocalStorageManager.saveSettings(settings)` writes `{ spaces, bookmarks, settings }`, keeping saved spaces and bookmarks
    - `ZenResourceManager.setAutoSleepEnabled(enabled)`; the inactivity loop in `startMonitor` skips sleeping while disabled; manual `sleepTab`, `wakeTab` and `sleepAllBackgroundTabs` unchanged
    - _Requirements: 2.1, 5.8, 5.9_

  - [x] 2.2 Wire settings and the single DarkReader injector into `src/main/index.ts` and `src/main/preload.ts`
    - On startup load `normalizeSettings(storage.loadState().settings)` and apply `adblockEnabled` and `zenSleepEnabled`
    - Add `applyDarkMode(wc)` per the design and call it from webview `dom-ready` (replacing the inline block) and for every webview in `neutrino:set-theme-mode`
    - Add `neutrino:get-settings` and `neutrino:update-settings(patch)` (re-normalize, apply changes, save, broadcast `neutrino:settings-updated`); when `darkModeExclusions` changes, call `applyDarkMode` for every webview
    - Route `neutrino:toggle-shields` through the update path so every toggle persists and broadcasts
    - Handle Ctrl+Comma in `before-input-event` by sending `neutrino:open-settings`
    - Expose `getSettings`, `updateSettings`, `onSettingsUpdated` and `onOpenSettings` in `preload.ts` and extend the `window.neutrino` type in `src/renderer/types.ts`
    - _Requirements: 1.4, 2.1, 2.2, 2.4, 3.6, 3.7, 3.8, 3.9, 3.10, 5.4, 5.5, 5.6_

  - [x] 2.3 Repoint the preservation live modules
    - In `tests/unit/liveModules.ts`, point `liveShouldInjectDarkReader` at `shouldInjectDarkReader(url, DEFAULT_SETTINGS.darkModeExclusions)` and `liveDarkReaderSettings` at `DARK_READER_SETTINGS`; update the header comment to name this spec
    - Leave `tests/unit/preservation.test.ts` unchanged and confirm Property 12 still passes
    - _Requirements: 3.9_

  - [x] 2.4 Write unit tests for Zen auto-sleep in `tests/unit/resourceManager.test.ts`
    - With fake timers: auto-sleep off leaves an idle tab awake past 10 minutes; `sleepTab` still sleeps it; auto-sleep on sleeps it
    - _Requirements: 5.8, 5.9_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Renderer settings panel and wiring
  - [x] 4.1 Create `useSettings` and `SettingsPanel`, and add panel styles
    - `src/renderer/hooks/useSettings.ts`: load with `getSettings`, subscribe to `onSettingsUpdated`, expose `updateSettings(patch)`, fall back to `DEFAULT_SETTINGS`
    - `src/renderer/components/SettingsPanel.tsx`: sections Appearance (Dark/Light, "Theme & accent", display name), Dark mode exclusions (current-site action, add field with inline error, removable chips), Privacy (shields switch), Search (four engines), Performance (Zen auto-sleep); closes on Escape, close button and overlay click; built on `.modal-overlay`, `.modal-content-card`, `.modal-header`, `.modal-title`, `.close-btn`
    - Add `.settings-*` classes to `src/renderer/styles/theme.css` using existing variables, with `:focus-visible` rings in `var(--accent)` and an `aria-label` on every control
    - _Requirements: 1.5, 1.6, 3.1, 3.3, 3.4, 4.1, 4.2, 4.4, 5.1, 5.2, 5.3, 5.4, 5.7, 5.8, 6.2, 6.3_

  - [x] 4.2 Update `CommandBar` and `ShieldModal`
    - `CommandBar.tsx`: optional props `searchEngine`, `onOpenSettings`, `activeTabUrl`, `isActiveSiteExcluded`, `onToggleSiteDarkMode`; add "> Open Settings" (hint `Ctrl+,`) and, for http(s) tabs only, "> Toggle Dark Mode for This Site"; build search URLs with `buildSearchUrl` and label the row "Search with <engine>"
    - `ShieldModal.tsx`: prop `enabled`; show "ACTIVE" or "OFF" and the matching card title
    - _Requirements: 1.2, 4.3, 4.4, 5.6, 5.7, 6.1_

  - [x] 4.3 Remove the renderer DarkReader injection from `BrowserViewport.tsx`
    - Delete the `darkReaderCode` raw import and the DarkReader load, enable and disable code in `syncDarkThemeForTab`; keep the `setThemeMode` call and `injectPdfViewerDarkTheme` unchanged
    - _Requirements: 3.10_

  - [x] 4.4 Wire the panel into `App.tsx` and `useBrowser.ts`
    - Add `isSettingsOpen`, the gear button (`Settings` icon, `.minimal-icon-btn`, `aria-label="Settings"`) at the end of `.minimal-top-right-cluster`, and open on `onOpenSettings`, the `neutrino:open-settings` window event and Ctrl+Comma in the global capture listener
    - Split `toggleDarkMode` into `setDarkMode(next)` plus the toggle; pass it to the panel
    - Display-name change writes the trimmed name to `neutrino_user_profile` and calls `setUserProfile`
    - Pass `searchEngine`, `onOpenSettings`, the active tab URL and a `toggleSiteExclusion` handler to `CommandBar`, and `settings.adblockEnabled` to `ShieldModal`; "Theme & accent" closes the panel and opens `ThemeCustomizerModal`
    - In `useBrowser.navigate`, intercept `neutrino://settings` (trimmed, case-insensitive) by dispatching `neutrino:open-settings` and skipping `window.neutrino.navigate`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 5.1, 5.2, 5.3, 5.6_

  - [x] 4.5 Write a source check for the single injector in `tests/unit/darkMode.test.ts`
    - Assert no file under `src/renderer` imports `darkreader` or contains `DarkReader.enable`
    - _Requirements: 3.10_

- [x] 5. Final checkpoint - Ensure all tests pass
  - Run `npm test` and `npm run build`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster result.
- Theme and display name keep their existing local-storage keys; no migration is needed.
- Task 3.7 of `google-signin-youtube-playback-fix` overlaps with tasks 1.1, 2.2 and 4.3 here. If that spec runs later, its `NATIVE_DARK_HOSTS` and dark-support probe parts are superseded by the exclusion list.
- Run vitest with `npm test` (`vitest --run`), never in watch mode.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.5", "2.2", "2.4", "4.2", "4.3"] },
    { "id": 2, "tasks": ["1.3", "2.3", "4.1", "4.5"] },
    { "id": 3, "tasks": ["1.4", "4.4"] },
    { "id": 4, "tasks": ["1.6"] }
  ]
}
```
