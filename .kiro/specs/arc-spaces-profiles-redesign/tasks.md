# Implementation Plan: Arc Spaces, Profiles and Redesign

## Overview

Implementation is in TypeScript (Electron 33 main process, React/Vite renderer) with vitest + fast-check, plus the existing Rust crate under `native/` for Windows Hello and DPAPI. The order is:

1. Pure, Electron-free modules and their property tests (profiles, partition mapping, migration, settings, shortcuts, password model, vault with a fake `safeStorage`, CSV, Chrome blob crypto, sidebar layout, archiver, preview throttle, top bar color).
2. Main-process session registry and wiring, which replaces every hard-coded `persist:neutrino` site.
3. Password capture/autofill, Hello-gated reveal/copy and Chrome/Edge import.
4. Renderer: the Arc sidebar replacing NotificationTabs, hover previews by tab id, archive UI, settings (RightPinsDock toggle, profiles, passwords), and the Dia-style top bar tint.

New property tests go under `tests/unit/arc/` (one file per property so they can run in parallel). Each property test runs at least 100 iterations and is tagged `Feature: arc-spaces-profiles-redesign, Property N: <text>`. Run tests with `npm test` (vitest --run), never watch mode.

Existing suites must stay green: `tests/unit/preservation.test.ts`, `settings.test.ts`, `settingsPanel.test.ts`, `shortcuts.test.ts`, `storage.test.ts`, `history.test.ts`, `vpn.test.ts`. `tests/unit/bugCondition.test.ts` has pre-existing expected failures from another spec; do not treat those as regressions and do not "fix" them here.

## Tasks

- [x] 1. Profile model, partition mapping and ProfileStore
  - [x] 1.1 Create profile data types and partition mapping
    - Create `src/main/profiles/types.ts` with `Profile`, `SpaceRecord` (with `profileId`), `TabEntry` (`section`, `lastActiveAt`, `unloaded`), `FavoriteEntry`, `ArchivedTab`, `ProfilesFile` (incl. per-profile `neverList` and `schemaVersion`; sidebar state and RightPinsDock visibility live in settings, task 3.1) and `CURRENT_SCHEMA_VERSION`
    - Create `src/main/profiles/partition.ts` with `partitionForProfile(id)`: `'default'` -> `'persist:neutrino'`, otherwise `persist:profile-<id>`; plus `DEFAULT_PROFILE_ID` and `DEFAULT_PARTITION` constants
    - No Electron imports in either file
    - _Requirements: 1.1, 1.3, 1.4, 5.2_

  - [ ]* 1.2 Write property test for partition mapping
    - File: `tests/unit/arc/partition.property.test.ts`
    - **Property 1: Profile partition mapping is injective and default-stable**
    - **Validates: Requirements 1.1, 5.2**

  - [x] 1.3 Implement ProfileStore over injected I/O
    - Create `src/main/profiles/store.ts` with `ProfileStore` taking `{ read, write, clearSession, rmFiles }`
    - Implement `createProfile` (creates profile plus one space), `renameProfile`, `deleteProfile` (rejects last profile; calls `clearSession(partition)` and `rmFiles(id)`; removes the profile's spaces, tabs, favorites, archive and never-list), `createSpace(name, profileId?)` (defaults to active profile), `deleteSpace` (rejects only space of a profile), `updateSpace` (rename/recolor/icon/reorder), `moveSpace`, `ownerOf`, `activeProfileId`, `setActiveSpace`, `partitionForSpace`
    - Add pure `serializeProfilesFile` / `parseProfilesFile` used by the store and by round-trip tests
    - Persist every mutation through `io.write`
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 1.8, 1.9, 1.10, 1.11, 1.12, 13.7, 13.9, 14.5, 15.2_

  - [ ]* 1.4 Write property test for tab-to-session resolution
    - File: `tests/unit/arc/tabPartition.property.test.ts`
    - **Property 2: Tabs resolve to their owning profile's session**
    - **Validates: Requirements 1.2, 1.3, 1.12**

  - [ ]* 1.5 Write property test for space ownership across operations
    - File: `tests/unit/arc/spaceOwnership.property.test.ts`
    - **Property 3: Each space is owned by exactly one profile across all operations**
    - **Validates: Requirements 1.5, 1.10, 1.11, 13.9**

  - [ ]* 1.6 Write property test for profile rename
    - File: `tests/unit/arc/profileRename.property.test.ts`
    - **Property 4: Rename preserves everything but the name**
    - **Validates: Requirements 1.6**

  - [ ]* 1.7 Write property test for profile deletion
    - File: `tests/unit/arc/profileDelete.property.test.ts`
    - **Property 5: Deleting a profile erases exactly that profile's references**
    - **Validates: Requirements 1.8, 1.9**

  - [ ]* 1.8 Write property test for layout storage round-trip
    - File: `tests/unit/arc/layoutRoundTrip.property.test.ts`
    - **Property 28: Layout state round-trips through storage**
    - **Validates: Requirements 14.5, 15.2, 13.7**

- [x] 2. Migration to the profile model
  - [x] 2.1 Implement pure migration and one-shot runner
    - Create `src/main/profiles/migration.ts` with pure `migrateToProfiles(legacyBrowserState)` producing one Default profile (`id: 'default'`), every legacy space mapped to a `SpaceRecord` with `profileId: 'default'` (ids, names, icons, colors preserved; `order` from array position), empty tabs/favorites/archive/never-list, and `schemaVersion`
    - `browser-state.json` stores only `spaces`, `bookmarks` and `settings` today (no tabs), so there are no legacy tabs to convert; leave `bookmarks` and `settings.pinnedSites` untouched (RightPinsDock data stays as is)
    - Implement `runMigrationOnce(io)`: skip when `profiles.json` has the current `schemaVersion`; write `browser-state.backup-<ts>.json` before any change; write `profiles.json` atomically (reuse `src/main/atomicFile.ts`); on any error log, leave `browser-state.json` unchanged and return a runtime Default profile on `persist:neutrino` built from pre-migration data
    - History stays in the existing `history.json`, which becomes the Default profile's history
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 21.1_

  - [ ]* 2.2 Write property test for migration content
    - File: `tests/unit/arc/migration.property.test.ts`
    - **Property 9: Migration assigns all legacy data to Default and preserves it**
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [ ]* 2.3 Write property test for migration idempotence and failure safety
    - File: `tests/unit/arc/migrationFailSafe.property.test.ts`
    - Use a fake fs that can throw at each write step
    - **Property 10: Migration is idempotent and fail-safe**
    - **Validates: Requirements 5.5, 5.6, 5.7**

- [x] 3. Settings keys and keyboard shortcuts
  - [x] 3.1 Extend settings normalization with new keys
    - In `src/main/settings.ts`, add `archiveIntervalHours` (12 | 24 | 168 | 720 | 'never', default 12), `rightPinsDockVisible` (default true), `sidebarExpanded` (default true), `sidebarAutoHide` (default false) to defaults and `normalizeSettings`
    - Keep unknown keys and idempotence; keep `tests/unit/settings.test.ts` and `settingsPanel.test.ts` passing unchanged
    - _Requirements: 12.5, 16.1, 16.2, 19.1, 19.4, 21.5_

  - [ ]* 3.2 Write property test for settings normalization
    - File: `tests/unit/arc/settingsNormalize.property.test.ts`
    - **Property 38: Settings normalization stays total and idempotent with new keys**
    - **Validates: Requirements 16.1, 16.2, 19.1, 19.4, 12.5, 21.5**

  - [x] 3.3 Extend space shortcuts to Ctrl+1..9
    - In `src/main/shortcuts.ts`, map Ctrl+1..9 to the space-select action with index N-1 (currently Ctrl+1..4); keep `toggle-tabs` for Ctrl+E (its handler now toggles the Sidebar in task 12.6)
    - Leave every other binding identical so `shortcuts.test.ts` and the `tests/unit/fixtures/original` comparisons stay green; if an existing assertion expects Ctrl+5..9 to be unbound, that is the documented A1 change and only that assertion is adjusted
    - _Requirements: 13.4, 21.8_

  - [ ]* 3.4 Write property test for shortcut preservation
    - File: `tests/unit/arc/shortcuts.property.test.ts`
    - **Property 39: Untouched keyboard shortcuts are unchanged**
    - **Validates: Requirements 13.4, 21.8**

- [x] 4. Password manager pure modules
  - [x] 4.1 Implement password model
    - Create `src/main/passwords/model.ts` with `normalizeOrigin` (scheme://host[:port], lowercased, default ports dropped, null for non-http(s)), `decideCapture` ('save' | 'update' | 'touch' | 'suppress'), never-list add/remove helpers, `suggestionsFor` (exact normalized-origin match, never offers an https-saved credential to an http frame), `toListDto` (no plaintext) and `filterCredentials` (case-insensitive substring on origin or username)
    - _Requirements: 6.2, 6.3, 6.4, 6.7, 6.8, 6.9, 8.1, 8.4, 8.5, 9.1, 9.5_

  - [ ]* 4.2 Write property test for capture decisions
    - File: `tests/unit/arc/captureDecision.property.test.ts`
    - **Property 11: Capture decision matches vault and never-list**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.8**

  - [ ]* 4.3 Write property test for never-list round-trip
    - File: `tests/unit/arc/neverList.property.test.ts`
    - **Property 12: Never-list add/remove round-trips the decision**
    - **Validates: Requirements 6.7, 6.9**

  - [ ]* 4.4 Write property test for autofill origin matching
    - File: `tests/unit/arc/suggestions.property.test.ts`
    - **Property 18: Autofill suggestions match the frame origin exactly**
    - **Validates: Requirements 8.1, 8.4, 8.5**

  - [ ]* 4.5 Write property test for list DTO and search
    - File: `tests/unit/arc/credentialList.property.test.ts`
    - **Property 22: Credential list carries no plaintext and search filters correctly**
    - **Validates: Requirements 9.1, 9.5**

  - [x] 4.6 Implement per-profile encrypted vault
    - Create `src/main/passwords/vault.ts` with `Vault` taking injected cipher (`isEncryptionAvailable`, `encryptString`, `decryptString`) and fs, file `vault-<profileId>.json`
    - Check `isEncryptionAvailable()` before every write and refuse the write (typed error) when false
    - Store `passwordEnc` as base64; on read, keep blobs that fail to decrypt verbatim and mark `unreadable: true`; write atomically (temp + rename via `atomicFile.ts`)
    - Add a shared fake cipher helper for tests at `tests/unit/arc/helpers/fakeSafeStorage.ts` (reverse+tag cipher, unavailable mode, corrupt-input path)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 4.7 Write property test for vault round-trip
    - File: `tests/unit/arc/vaultRoundTrip.property.test.ts`
    - **Property 14: Vault encrypt/decrypt round-trip and plaintext-at-rest exclusion**
    - **Validates: Requirements 7.1**

  - [ ]* 4.8 Write property test for vault refusal without encryption
    - File: `tests/unit/arc/vaultRefuse.property.test.ts`
    - **Property 15: Vault refuses to write without encryption**
    - **Validates: Requirements 7.2, 11.8**

  - [ ]* 4.9 Write property test for unreadable credentials
    - File: `tests/unit/arc/vaultUnreadable.property.test.ts`
    - **Property 16: Unreadable credentials are preserved and excluded**
    - **Validates: Requirements 7.3**

  - [ ]* 4.10 Write property test for vault isolation and atomic writes
    - File: `tests/unit/arc/vaultIsolation.property.test.ts`
    - **Property 17: Vaults are per-profile isolated and atomically written**
    - **Validates: Requirements 7.4, 7.5**

  - [x] 4.11 Implement CSV parse/serialize and import classification
    - Create `src/main/passwords/csv.ts` with an RFC 4180 parser and serializer (quotes, embedded commas/newlines, unicode, BOM), header detection for url/username/password columns (Chrome/Edge export names), and `classifyImport(rows, existing)` returning imported/duplicate/conflict/invalid buckets with counts
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 4.12 Write property test for CSV round-trip and classification
    - File: `tests/unit/arc/csv.property.test.ts`
    - **Property 23: CSV import round-trips and classification counts are total**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

  - [x] 4.13 Implement Chrome blob classification and v10 decryption
    - Create `src/main/passwords/chromeImport.ts` with pure `classifyChromeBlob(bytes)` ('v10' | 'v20-app-bound' | 'undecryptable', never throws) and `decryptV10(key, blob)` using Node `crypto` AES-256-GCM (3-byte prefix, 12-byte nonce, 16-byte tag)
    - _Requirements: 11.6, 11.7_

  - [ ]* 4.14 Write property test for Chrome blob handling
    - File: `tests/unit/arc/chromeBlob.property.test.ts`
    - **Property 24: Chrome blob classification is total and AES-GCM v10 round-trips**
    - **Validates: Requirements 11.6, 11.7**

- [x] 5. Sidebar layout model (pure)
  - [x] 5.1 Implement layout operations
    - Create `src/main/sidebar/layout.ts` (no Electron imports, importable by the renderer) with `visibleTabsForSpace` (favorites = owning profile's, pinned/today = space's), `reorder`, `move(file, op)` for within-section, between-section (favorite/pinned/today) and drop-on-space moves returning `{ file, needsReload }` (true exactly when profiles differ), `beginDrag`/`cancelDrag` snapshot, `closeTab` (pinned -> `unloaded: true`; today -> removed and pushed to reopen list), `pin`/`unpin`/`addFavorite`/`removeFavorite`/`duplicate`
    - Add `sidebarVisibility(autoHide, pointerX, overSidebar)` (8px edge), `selectSpaceByIndex(orderedSpaces, n, current)` and `activationTarget(space)` (last active tab, else first visible, else 'new-today-tab')
    - Space_Switcher order: profiles in creation order, spaces by `order` within each
    - _Requirements: 12.4, 12.9, 13.1, 13.4, 13.5, 13.6, 14.1, 14.2, 14.4, 15.1, 15.3, 15.5, 17.1, 17.2, 17.3, 17.4, 17.5, 17.7_

  - [ ]* 5.2 Write property test for auto-hide visibility
    - File: `tests/unit/arc/sidebarVisibility.property.test.ts`
    - **Property 25: Sidebar auto-hide visibility is a pure function of pointer and mode**
    - **Validates: Requirements 12.4**

  - [ ]* 5.3 Write property test for Ctrl+N space selection
    - File: `tests/unit/arc/spaceIndex.property.test.ts`
    - **Property 26: Ctrl+N selects the Nth space or keeps the current one**
    - **Validates: Requirements 13.4, 13.5**

  - [ ]* 5.4 Write property test for space activation target
    - File: `tests/unit/arc/spaceActivation.property.test.ts`
    - **Property 27: Space activation selects the last active tab deterministically**
    - **Validates: Requirements 13.6**

  - [ ]* 5.5 Write property test for shared favorites
    - File: `tests/unit/arc/favoritesShared.property.test.ts`
    - **Property 29: Favorites are shared across a profile's spaces**
    - **Validates: Requirements 14.2**

  - [ ]* 5.6 Write property test for drag-and-drop move invariants
    - File: `tests/unit/arc/layoutMove.property.test.ts`
    - **Property 30: Drag-and-drop moves preserve the tab multiset and set the right section**
    - **Validates: Requirements 14.1, 14.4, 15.1, 15.5, 17.1, 17.2, 17.3**

  - [ ]* 5.7 Write property test for cross-profile reload
    - File: `tests/unit/arc/layoutReload.property.test.ts`
    - **Property 31: Moves reload only across profiles**
    - **Validates: Requirements 17.4, 17.5**

  - [ ]* 5.8 Write property test for drag cancel
    - File: `tests/unit/arc/dragCancel.property.test.ts`
    - **Property 32: Escape cancels a drag back to the original layout**
    - **Validates: Requirements 17.7**

  - [ ]* 5.9 Write property test for closing pinned vs today tabs
    - File: `tests/unit/arc/closeTab.property.test.ts`
    - **Property 33: Closing a pinned tab keeps its entry; closing a today tab removes it**
    - **Validates: Requirements 12.9, 15.3**

- [x] 6. Archiver, preview throttle and top bar color (pure)
  - [x] 6.1 Implement archiver core
    - Create `src/main/archive/archiver.ts` with `selectTabsToArchive(tabs, { now, intervalMs, activeTabId, audioTabIds })`, `intervalToMs(setting)` ('never' -> null), `restore(file, archivedId, activeSpaceId, now)` (original space if it exists, else active space; removes entry; returns new Today `TabEntry`), `prune(archive, now)` (keep <= 30 days) and `listArchive(file, profileId)` (newest first)
    - _Requirements: 15.6, 16.1, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_

  - [ ]* 6.2 Write property test for archive selection
    - File: `tests/unit/arc/archiveSelect.property.test.ts`
    - **Property 34: Archive selection respects interval, activity, audio and pinning**
    - **Validates: Requirements 16.3, 16.4, 16.5, 16.6, 15.6**

  - [ ]* 6.3 Write property test for archive list, restore and prune
    - File: `tests/unit/arc/archiveRestore.property.test.ts`
    - **Property 35: Archive list ordering, restore target, and 30-day pruning**
    - **Validates: Requirements 16.7, 16.8, 16.9**

  - [x] 6.4 Implement preview throttle and in-memory store
    - Create `src/main/previews/service.ts` with pure `shouldCapture(lastCapturedAt, now, reason)` ('deactivation' always; 'periodic' at most once per 30s) and a `PreviewStore` keyed by tab id with `set`, `get`, `onSleep` (keeps preview), `onClose`/`onArchive` (deletes)
    - Keep the Electron `capturePage` call behind an injected capture function so the module stays testable
    - _Requirements: 18.3, 18.4, 18.5, 18.7_

  - [ ]* 6.5 Write property test for preview throttle and lifecycle
    - File: `tests/unit/arc/previewService.property.test.ts`
    - **Property 36: Preview capture is throttled and lifecycle-correct**
    - **Validates: Requirements 18.3, 18.5, 18.7**

  - [x] 6.6 Implement top bar color utilities
    - Create `src/main/topbar/color.ts` (no Electron/Node imports, so the renderer can import it) with `parseCssColor` (hex 3/4/6/8, rgb/rgba, hsl/hsla, named basics), `resolvePageColor(themeColor, sampledColor, isInternalPage)`, `relativeLuminance`, `contrastRatio` and `pickForeground(bg)` guaranteeing >= 4.5:1
    - _Requirements: 20.1, 20.2, 20.4, 20.5, 20.6_

  - [ ]* 6.7 Write property test for page color precedence and contrast
    - File: `tests/unit/arc/topbarColor.property.test.ts`
    - **Property 37: Page color precedence and contrast**
    - **Validates: Requirements 20.1, 20.2, 20.4, 20.5, 20.6**

- [x] 7. Checkpoint - pure modules
  - Ensure all tests pass with `npm test`, ask the user if questions arise. Confirm `preservation.test.ts`, `settings.test.ts` and `shortcuts.test.ts` are still green; `bugCondition.test.ts` failures from the other spec are expected.

- [x] 8. Session registry and main-process partition wiring
  - [x] 8.1 Create SessionConfigurator
    - Create `src/main/sessions/configurator.ts` porting the logic currently inlined in `applyInterception` in `src/main/index.ts` (adblock `onBeforeRequest`, blocked-count reporting, `applyBrowserIdentity`/UA, permission request and check handlers, auth handoff hook) into `configure(session)`, behavior unchanged for `persist:neutrino`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 21.3, 21.14_

  - [x] 8.2 Create SessionRegistry
    - Create `src/main/sessions/registry.ts` with `ensure(partition)` (idempotent, configures once before returning), `partitions()` (live set), `applyToAll(fn)`; accept an injected `fromPartition` so tests use fake sessions
    - _Requirements: 2.1, 2.8_

  - [x] 8.3 Make VPN target all profile sessions
    - In `src/main/vpn.ts`, replace the fixed `partitions` array with a `getPartitions: () => string[]` callback, apply proxy/DoH/kill-switch to default session plus every partition (and to newly registered ones), and make `verifyPublicIp(partition)` use the given partition (default `persist:neutrino`)
    - Keep `tests/unit/vpn.test.ts` passing
    - _Requirements: 2.5, 2.6, 2.7, 21.9_

  - [ ]* 8.4 Write property test for VPN and configurator targets
    - File: `tests/unit/arc/sessionTargets.property.test.ts`
    - **Property 6: VPN and configurators target exactly the registered sessions**
    - **Validates: Requirements 2.5, 2.6, 2.8**

  - [x] 8.5 Pass opener partition through window-open decisions
    - In `src/main/windowOpen.ts`, add optional `partition` to `WindowOpenContext`, make `buildPopupWindowOptions(url, mainWindow, partition)` use `partition ?? 'persist:neutrino'`, and keep `createTab.spaceId = opener.spaceId` for the tab branch
    - The default case must still equal the `tests/unit/fixtures/original` output so `preservation.test.ts` stays green
    - _Requirements: 3.1, 3.2, 21.10_

  - [ ]* 8.6 Write property test for popup partitions
    - File: `tests/unit/arc/popupPartition.property.test.ts`
    - **Property 7: Popups inherit the opener's partition with a safe default**
    - **Validates: Requirements 3.1, 3.2, 21.10**

  - [x] 8.7 Create per-profile HistoryRegistry
    - Create `src/main/history/registry.ts` that lazily builds one `HistoryManager` (from `src/main/history.ts`) per profile: Default -> existing `history.json`, others -> `history-<id>.json`; add `remove(profileId)` for profile deletion
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 8.8 Write property test for history partitioning
    - File: `tests/unit/arc/historyPartition.property.test.ts`
    - **Property 8: History is partitioned by owning profile**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [x] 8.9 Make BrowserManager profile-aware
    - In `src/main/browserManager.ts`, resolve each tab's partition via `ProfileStore.partitionForSpace(tab.spaceId)`, add `partition` to the emitted tab state, record history through `HistoryRegistry.for(owner)`, update `lastActiveAt` on activation, track `section`/`unloaded`, create Today tabs in the active space, and implement space activation using `activationTarget`
    - Reload a tab in its new partition when a cross-profile move reports `needsReload`
    - Make `ProfileStore` authoritative for spaces and tabs: stop calling `storage.saveState({ spaces })`, persist pinned/Today `TabEntry` records through `ProfileStore`, restore them at startup (pinned as unloaded entries, Today tabs asleep until activated), and have `exportSyncPackage` read spaces from `ProfileStore`; keep `LocalStorageManager` itself unchanged so `storage.test.ts` stays green
    - _Requirements: 1.2, 1.3, 1.12, 4.1, 12.8, 13.6, 15.2, 16.4, 17.4, 17.5, 21.2_

  - [x] 8.10 Wire profiles and sessions into index.ts
    - In `src/main/index.ts`: run `runMigrationOnce` in `app.whenReady` before the first `createTab`; construct `ProfileStore`, `SessionRegistry` (replacing `setupNetworkInterception` and the inline `applyInterception`), `HistoryRegistry`; call `registry.ensure` for every profile at startup and on profile creation; keep the `session-created` hook as a safety net
    - Resolve the opener partition from webContents -> tab -> profile in `setWindowOpenHandler` and pass it to `decideWindowOpen`
    - Pass `getPartitions: () => registry.partitions()` to `VpnController`; call `verifyPublicIp` with the active partition; call `registry.applyToAll` on shields/identity/UA setting changes
    - Make `neutrino:get-history`, `delete-history-entry`, `clear-history` and command-bar history suggestions use the active profile
    - Add IPC for profiles (list/create/rename/delete), spaces (create with profile/update/reorder/delete), layout ops (move/pin/unpin/favorite/duplicate/close/reopen); sidebar state persists through the existing settings IPC (task 3.1 keys); profile deletion closes tabs, clears session storage, deletes history and vault files
    - _Requirements: 1.2, 1.5, 1.6, 1.8, 1.9, 1.11, 2.1–2.8, 3.1, 4.2, 4.3, 4.4, 5.1, 12.5, 13.7, 13.9, 21.1, 21.3, 21.14_

  - [x] 8.11 Expose profile APIs to the renderer
    - Extend `src/main/preload.ts` with the new profile/space/layout/sidebar IPC; add `partition` to `TabState` and `profileId` to `Space` in `src/renderer/types.ts`; extend `src/renderer/hooks/useBrowser.ts` and create `src/renderer/hooks/useProfiles.ts`
    - Keep `contextIsolation` on and existing preload APIs unchanged
    - _Requirements: 1.2, 1.12, 13.1, 13.7_

- [x] 9. Checkpoint - main-process wiring
  - Ensure all tests pass with `npm test`, ask the user if questions arise. Confirm the `persist:neutrino` default popup assertion in `preservation.test.ts` still passes.

- [x] 10. Password capture, autofill, reveal/copy and import
  - [x] 10.1 Add Windows Hello verification and DPAPI unwrap to the native crate
    - `neutrino-core.exe` (`native/src/main.rs`) is currently a stdin URL-checker that nothing in `src/main` calls. Add one-shot subcommands while keeping the existing stdin mode as the no-argument default: `verify --hwnd <n> --reason <text>` using `UserConsentVerifier.CheckAvailabilityAsync` and `IUserConsentVerifierInterop::RequestVerificationForWindowAsync` (parented to Neutrino's window), printing verified/cancelled/failed/unavailable as JSON; and `dpapi-unprotect` (`CryptUnprotectData` on base64 stdin) for the Chrome/Edge `os_crypt` key
    - Add the `windows` crate with the needed features to `native/Cargo.toml`; keep the binary built by `build.py` and copied to `resources/bin`
    - _Note: requires the Rust toolchain on the build machine; this task cannot be verified by `npm test`_
    - _Requirements: 10.1, 10.5, 10.6, 11.6_

  - [x] 10.2 Implement OS authenticator bridge
    - Create `src/main/passwords/osAuth.ts` with `OSAuthenticator.verify(reason)` spawning `neutrino-core.exe verify` via `execFile` with the main window HWND (`getNativeWindowHandle()`), resolving the binary from `process.resourcesPath/bin` when packaged and `native/target/release` in development, and mapping results; report `unavailable` when the helper or Hello is missing
    - _Requirements: 10.1, 10.5, 10.6_

  - [x] 10.3 Implement PasswordManager
    - Create `src/main/passwords/manager.ts` with injected vault factory, never-list access (via `ProfileStore`), authenticator, clipboard and clock
    - `PendingCaptureStore` in memory only; drop entries on save/update/never/not-now/dismiss/expiry
    - Capture flow uses `decideCapture`; `touch` updates last-used; save/update write to the owning tab's profile vault; surface the "encryption unavailable" error
    - Fill tokens: issue only on user selection, bound to webContents id + frame + origin, single use; redeem updates last-used
    - Reveal: verify (or `needs-confirm` when unavailable), return plaintext for one credential only on success; copy writes the clipboard in main, never returns plaintext, clears after 30s only if the clipboard still equals the password
    - List (DTO only), edit, delete, never-list remove; CSV import commit (skip duplicates, ask keep/replace for conflicts, refuse when encryption unavailable, discard plaintext after commit/cancel)
    - _Requirements: 6.2–6.10, 7.2, 8.2, 8.3, 8.5, 8.6, 8.7, 9.2, 9.3, 9.4, 10.1–10.6, 11.1, 11.3, 11.4, 11.8, 11.9_

  - [ ]* 10.4 Write property test for pending capture handling
    - File: `tests/unit/arc/pendingCapture.property.test.ts`
    - **Property 13: Unsaved captures never reach disk**
    - **Validates: Requirements 6.10**

  - [ ]* 10.5 Write property test for fill-token binding
    - File: `tests/unit/arc/fillToken.property.test.ts`
    - **Property 19: Fill tokens are bound to their issuing frame and origin**
    - **Validates: Requirements 8.3, 8.6**

  - [ ]* 10.6 Write property test for reveal/copy outcomes
    - File: `tests/unit/arc/revealCopy.property.test.ts`
    - **Property 20: Reveal/copy release plaintext only on success and never leak via copy**
    - **Validates: Requirements 9.2, 10.1, 10.3, 10.5, 10.6**

  - [ ]* 10.7 Write property test for clipboard clearing
    - File: `tests/unit/arc/clipboardClear.property.test.ts`
    - **Property 21: Clipboard clears only when still holding the copied password**
    - **Validates: Requirements 10.4**

  - [x] 10.8 Implement the page password preload
    - Create `src/main/passwords/passwordPreload.ts` (separate from `preload.ts`, `contextIsolation` on): detect form submits (plus best-effort detection of submit-button clicks for fetch-only logins) with a password field and nearest username field on http/https frames, including subframes and send `{ frameOrigin, username, password }` on a dedicated channel; on login-field focus request suggestions for the frame origin and render a username list; on selection send the token request and set field values with the returned credential
    - Add a build entry so the preload is emitted to `dist-main/`
    - _Requirements: 6.1, 8.1, 8.2, 8.3, 8.6_

  - [x] 10.9 Implement Chrome/Edge direct import reader
    - Extend `src/main/passwords/chromeImport.ts`: locate Chrome/Edge `User Data` dirs, read `Local State` and copy `Login Data` to a temp file (sources opened read-only, never modified), unwrap the `os_crypt` key via the native DPAPI helper, read the `logins` table with a minimal dependency-free SQLite3 B-tree reader (table leaf/interior pages, record format, overflow pages), and decrypt `v10` blobs
    - Return 'not-possible' with CSV export steps for v20/App_Bound or any decrypt/parse failure; if the reader proves infeasible, ship only the 'not-possible' path and note it in code comments as the design's documented fallback
    - Delete the temp copy and drop plaintext after commit or failure
    - _Requirements: 11.5, 11.6, 11.7, 11.9_

  - [ ]* 10.10 Write unit tests for the Chrome/Edge reader
    - File: `tests/unit/arc/chromeImport.reader.test.ts`
    - Use a small hand-built SQLite fixture (or skip if 10.9 shipped only the fallback); test v20 and corrupt inputs return 'not-possible' and source files are unchanged
    - _Requirements: 11.5, 11.6, 11.7, 11.9_

  - [x] 10.11 Wire the password manager into main and preload
    - In `src/main/index.ts`, construct `PasswordManager` with `safeStorage`, `clipboard` and per-profile vaults; add a new `will-attach-webview` handler (none exists today) that sets `passwordPreload` and `nodeIntegrationInSubFrames: true` on page webviews and skips assistant drawer webviews identified by a marker in their `webpreferences` string (define the marker constant here; task 12.8 applies it in `McpModal`); add IPC handlers for capture, prompt responses, suggestions, fill-token redeem (validating sender webContents/frame/origin), list, edit, delete, reveal, copy, never-list, CSV import and Chrome/Edge import
    - Extend `src/main/preload.ts` with the renderer-facing password APIs (no plaintext except the reveal response)
    - Delete the profile's vault on profile deletion
    - _Requirements: 6.1, 6.5, 7.4, 8.5, 9.2, 10.3, 11.1, 11.5, 1.8_

- [x] 11. Checkpoint - password manager
  - Ensure all tests pass with `npm test`, ask the user if questions arise.

- [x] 12. Renderer: sidebar, previews, archive, settings and top bar
  - [x] 12.1 Replace URL-based preview capture with tab-id previews in main
    - In `src/main/index.ts` and `src/main/browserManager.ts`, use `PreviewStore`: capture on tab deactivation and periodically (throttled) for awake tabs shown in the sidebar, independent of any drawer; keep previews on sleep/unload; delete on close/archive
    - Add IPC `capture-tab-preview-by-id(tabId)` and `get-tab-preview(tabId)`; in `src/main/preload.ts` keep the old URL-based call as a compatibility shim
    - _Requirements: 18.3, 18.4, 18.5, 18.7_

  - [x] 12.2 Add archive scheduler, IPC and archive list component
    - In `src/main/index.ts`, run `prune` on load and `selectTabsToArchive` on startup and on an interval using the `archiveIntervalHours` setting, the active tab and audio-playing tabs; close and record archived tabs; add IPC `list-archive` and `restore-archived-tab`; expose them in `src/main/preload.ts`
    - Create `src/renderer/components/ArchiveList.tsx` showing title, URL, space and archive time newest first with restore
    - _Requirements: 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_

  - [x] 12.3 Rewrite Sidebar.tsx as the Arc sidebar
    - Rewrite the existing `src/renderer/components/Sidebar.tsx`: Favorites_Grid, pinned section, Today list, Space_Switcher (spaces of every profile with an owning-profile badge) from `visibleTabsForSpace`; favicon/title with active and sleeping marks; click activates (unloaded pinned tabs load their saved URL; favorites load in the active profile's session); new tab control opens the Command_Bar; context menu with pin, unpin, add/remove favorite, move to space, duplicate, close
    - Expanded/collapsed toggle and auto-hide via `sidebarVisibility`, persisted through the existing settings IPC (`sidebarExpanded`, `sidebarAutoHide`); two-finger horizontal swipe via `src/renderer/utils/trackpadGesture.ts` selects next/previous space; active space shows its name, icon and color
    - _Requirements: 12.1, 12.4, 12.5, 12.6, 12.7, 12.8, 12.10, 13.1, 13.2, 13.3, 13.6, 14.2, 14.3, 15.4_

  - [x] 12.4 Add drag and drop to the sidebar
    - In `Sidebar.tsx`, implement drag within and between Favorites/pinned/Today and onto space icons using `beginDrag`/`move`/`cancelDrag`; render a drop indicator at the current position; Escape cancels and restores the original layout; persist via layout IPC
    - _Requirements: 14.1, 15.1, 15.5, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 12.5 Add hover previews to the sidebar
    - In `Sidebar.tsx`, show the preview by tab id after a 400 ms hover with title and URL, hide when the pointer leaves both tab and preview, and show a favicon+title placeholder when no preview exists
    - _Requirements: 18.1, 18.2, 18.5, 18.6_

  - [x] 12.6 Integrate the sidebar into App.tsx and remove NotificationTabs
    - In `src/renderer/App.tsx`, remove the `NotificationTabs` lazy import, the `left-edge-hover-zone` and the drawer mount; delete `src/renderer/components/NotificationTabs.tsx` once nothing imports it; mount the new Sidebar; make `toggle-tabs` (Ctrl+E) toggle the sidebar; route Ctrl+T to the Command_Bar creating a Today tab in the active space; handle space-select index via `selectSpaceByIndex`
    - Mount `ArchiveList`; render `RightPinsDock` only when `rightPinsDockVisible` is true (stored `pinnedSites` untouched); pass the active profile's partition to `McpModal`
    - Keep window controls, command bar, media player and theme customizer working
    - _Requirements: 12.2, 12.3, 12.8, 13.4, 13.5, 16.7, 19.2, 19.3, 3.3, 21.4, 21.11, 21.13_

  - [x] 12.7 Use the tab's partition in BrowserViewport
    - In `src/renderer/components/BrowserViewport.tsx`, replace the hard-coded webview `partition` with `tab.partition` and include the partition in the webview `key` so a cross-profile move remounts the webview in the new session
    - _Requirements: 1.2, 1.12, 17.5, 21.1_

  - [x] 12.8 Use the active profile's partition in McpModal
    - In `src/renderer/components/McpModal.tsx`, add a `partition` prop, remove the hard-coded partition from the `ASSISTANTS` entries, include the partition in each webview `key` so a profile change reloads the assistants in the new session, and add the assistant marker to the webview `webpreferences` string so task 10.11 skips the password preload
    - _Requirements: 3.3, 3.4, 21.7_

  - [x] 12.9 Add layout settings to SettingsPanel
    - In `src/renderer/components/SettingsPanel.tsx`, add the RightPinsDock show/hide toggle (default shown), the Archive_Interval selector (12h, 24h, 7d, 30d, never) and the sidebar auto-hide toggle, all persisted through existing settings IPC
    - Keep all existing settings and `settingsPanel.test.ts` passing
    - _Requirements: 12.5, 16.2, 19.1, 19.4, 21.5_

  - [x] 12.10 Add profile and space management to SettingsPanel
    - In `SettingsPanel.tsx`, add a profiles section: create (name), rename, delete with a confirmation dialog listing what will be erased, and a "last profile cannot be deleted" message; space deletion asks for confirmation when the space has tabs and shows the "each profile needs at least one space" message; new space picks an owning profile, defaulting to the active one
    - _Requirements: 1.5, 1.6, 1.7, 1.9, 1.11, 13.7, 13.8, 13.9_

  - [x] 12.11 Add the passwords section to SettingsPanel
    - In `SettingsPanel.tsx`, list the active profile's credentials (origin, username, unreadable marker) with search, edit, delete, reveal (hide after 30s or when the section closes), copy, the confirmation dialog for `needs-confirm`, a "verification did not succeed" message, the never-list with remove, and the import dialog (CSV picker with imported/duplicate/invalid counts and keep/replace conflict prompts; Chrome/Edge direct import with the "not possible" message and CSV export steps; the "system encryption unavailable" message)
    - _Requirements: 7.2, 7.3, 9.1, 9.3, 9.4, 9.5, 9.6, 10.2, 10.5, 10.6, 11.2, 11.4, 11.7, 11.8_

  - [x] 12.12 Add save/update password prompts
    - Create `src/renderer/components/PasswordPrompt.tsx` with the save prompt ("Save", "Never for this site", "Not now") and update prompt ("Update", "Not now") driven by main-process events, showing the encryption-unavailable error; mount it in `src/renderer/App.tsx`
    - _Requirements: 6.2, 6.3, 6.5, 6.6, 6.7, 7.2_

  - [x] 12.13 Implement the Dia-style top bar tint
    - In `src/renderer/App.tsx` (and `src/renderer/styles/theme.css`), on active-tab change and load finish read the page `theme-color` meta via the webview, fall back to sampling the top strip of `capturePage`, and listen to `did-change-theme-color` for live updates; resolve with `resolvePageColor`, set top bar background/foreground CSS variables using `pickForeground`, and animate with a 200 ms transition; internal `neutrino://` pages and undeterminable colors use the default theme so the theme customizer and Space theme keep working
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 21.12_

  - [ ]* 12.14 Write unit tests for the new settings UI
    - File: `tests/unit/arc/settingsPanelArc.test.ts`
    - Cover the RightPinsDock toggle, Archive_Interval options, profile delete confirmation and last-profile rejection message, and that the password list renders no plaintext
    - _Requirements: 1.7, 1.9, 9.1, 16.2, 19.1_

  - [ ]* 12.15 Write a static check for hard-coded partitions
    - File: `tests/unit/arc/partitionSites.test.ts`
    - Assert `'persist:neutrino'` appears in `src/` only in `src/main/profiles/partition.ts`, the `windowOpen.ts` fallback and the `vpn.ts` default, and that `NotificationTabs` is no longer imported
    - _Requirements: 1.2, 3.1, 3.3, 12.2_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass with `npm test`, ask the user if questions arise. `preservation.test.ts`, `settings.test.ts`, `settingsPanel.test.ts`, `shortcuts.test.ts`, `storage.test.ts`, `history.test.ts` and `vpn.test.ts` must be green; only the pre-existing `bugCondition.test.ts` failures from the other spec are acceptable.

- [ ] 14. Sidebar declutter and Arc-style space swiping
  - [ ] 14.1 Declutter the sidebar
    - In `src/renderer/components/Sidebar.tsx`, remove the empty-state texts "Favorites appear here" and "No pinned tabs" (render nothing when a section is empty), remove the "Pinned" and "Today" `nsb-section-label` elements (keep the subtle `nsb-divider` between pinned and Today, hidden when both sides are empty), and remove the `nsb-new-tab` "+ New Tab" button; drop the now-unused styles from `src/renderer/styles/sidebar.css`
    - Ctrl+T and the Command_Bar still create Today tabs in the Active_Space; keep `openCommandBar` on the actions interface only if another caller still uses it
    - Keep empty Favorites and pinned sections as valid drop targets for `src/renderer/hooks/useSidebarDrag.ts` / `src/renderer/utils/sidebarDrag.ts`: zero/minimal height at rest, expanding to a visible drop zone (with the drop indicator) only while a drag is active
    - Update any tests asserting the removed text, labels or button (check `tests/unit/arc/sidebarModel.test.ts`, `tests/unit/arc/sidebarDrag.test.ts`)
    - _Requirements: 12.1, 12.8, 14.2, 15.1, 17.1, 17.2, 17.3, 17.6; bugfix 2.14_

  - [x] 14.2 Arc-style space switcher and smooth swipe
    - Create a pure helper `src/renderer/utils/spaceSwipe.ts` (no DOM/React imports): accumulate horizontal wheel deltas into a track offset, rubber-band resistance past the first/last space (no wrap), and `release(offset, velocity, width, index, count)` returning the target index (next/previous when |offset| > ~30% of pane width or velocity exceeds a flick threshold, otherwise the current index); add unit tests in `tests/unit/arc/spaceSwipe.test.ts`, including a fast-check property that the target index stays in `[0, count-1]` and differs from the current index by at most 1
    - Space_Switcher at the bottom of `Sidebar.tsx`: one horizontal row of space icons only, no space names and no profile badges or labels; the active space is highlighted with its color; space name and owning profile appear only in the tooltip/`aria-label`; when more than one profile exists, separate profile groups with a subtle gap/divider instead of text; keep drop-on-space-icon (R17.3) and Ctrl+1..9 (`selectSpaceByIndex`) working
    - Lay out the pinned/Today content as a horizontal track of space panes; Favorites stay fixed when the adjacent space shares the profile, otherwise they slide with the pane. A two-finger horizontal trackpad swipe moves the track 1:1 with the gesture; on release it snaps with an eased ~250 ms animation to the target from `spaceSwipe.ts` or springs back. Icon clicks and Ctrl+N animate the same slide. The space color tint crossfades during the slide. Under `prefers-reduced-motion` the switch is instant
    - Commit `selectSpace` only when the snap completes (no per-frame IPC); `preventDefault` on horizontal wheel over the sidebar so the page does not navigate back/forward; ignore swipes while a drag is active and let vertical-dominant wheel events scroll normally; replace the discrete-step use of `src/renderer/utils/trackpadGesture.ts` in the sidebar (keep the util and `tests/unit/trackpadGesture.test.ts` unchanged)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 14.2, 17.3; bugfix 2.15_

  - [ ] 14.3 Checkpoint - sidebar declutter and swipe
    - Run `npm test` (vitest --run), `npm run build:renderer` and `npm run build:main`; ask the user if questions arise. Only the 5 pre-existing `bugCondition.test.ts` failures are acceptable.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements; property tests reference design properties 1–39 (every property has exactly one test task).
- Pure modules have no Electron imports so they can be tested with fakes (fs, `safeStorage`, sessions, clipboard, clock).
- The Chrome/Edge SQLite reader is a known risk (no SQLite dependency in the project); the CSV-export fallback in 10.9 satisfies Requirement 11.7 if the reader is not feasible.
- `src/renderer/components/Sidebar.tsx` already exists and is rewritten in 12.3.
- Run tests with `npm test` (vitest --run), never in watch mode.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "3.3", "4.1", "4.11", "4.13", "6.4", "6.6", "10.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "3.2", "3.4", "4.2", "4.3", "4.4", "4.5", "4.6", "4.12", "4.14", "5.1", "6.1", "6.5", "6.7"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.6", "1.7", "1.8", "2.2", "2.3", "4.7", "4.8", "4.9", "4.10", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "6.2", "6.3"] },
    { "id": 3, "tasks": ["8.1", "8.3", "8.5", "8.7", "10.2"] },
    { "id": 4, "tasks": ["8.2", "8.6", "8.8", "8.9", "10.3"] },
    { "id": 5, "tasks": ["8.4", "8.10", "10.4", "10.5", "10.6", "10.7", "10.8", "10.9"] },
    { "id": 6, "tasks": ["8.11", "10.10"] },
    { "id": 7, "tasks": ["10.11"] },
    { "id": 8, "tasks": ["12.1"] },
    { "id": 9, "tasks": ["12.2", "12.3", "12.7", "12.8", "12.9"] },
    { "id": 10, "tasks": ["12.4", "12.10"] },
    { "id": 11, "tasks": ["12.5", "12.11"] },
    { "id": 12, "tasks": ["12.6"] },
    { "id": 13, "tasks": ["12.12"] },
    { "id": 14, "tasks": ["12.13"] },
    { "id": 15, "tasks": ["12.14", "12.15"] },
    { "id": 16, "tasks": ["14.1"] },
    { "id": 17, "tasks": ["14.2"] }
  ]
}
```
