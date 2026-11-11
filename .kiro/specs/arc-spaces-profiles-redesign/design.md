# Design Document

## Overview

This design turns Neutrino's single shared session (`persist:neutrino`) into a per-profile model, adds a per-profile encrypted password manager, replaces the `NotificationTabs` drawer with an Arc-style sidebar, adds auto-archive and hover previews, exposes a RightPinsDock visibility toggle, and tints the top bar to the active page color. Existing data migrates into a "Default" profile on `persist:neutrino` so no one is logged out, and all existing behavior and tests are preserved (R21).

The work is organized around a small set of new Main_Process components and pure modules (so most logic is unit/property testable without Electron), plus renderer components and IPC wiring. The guiding rule is: **every place that today hard-codes `persist:neutrino` resolves a partition from the owning Profile instead**, and the resolution flows from one authoritative source.

Language: TypeScript (Electron main + React/Vite renderer), matching the existing codebase. Windows Hello uses the existing Rust crate under `native/`.

### Guiding constraints from the current code

- The partition is hard-coded in five places that must all route through profile resolution:
  - `src/main/index.ts:165` (`setupNetworkInterception`) and the `session-created` hook at `:231`.
  - `src/main/windowOpen.ts:62` (`buildPopupWindowOptions`).
  - `src/main/vpn.ts:296` (`verifyPublicIp`) and the constructor `partitions` list set in `index.ts:67`.
  - `src/renderer/components/BrowserViewport.tsx:1006` (webview `partition`).
  - `src/renderer/components/McpModal.tsx:45-73` (assistant `partition`).
- `Space.containerPartition` exists in `src/main/sync/storage.ts:10` but is unused. We stop using it for partitions (partitions derive from Profile, not Space) and keep spaces linked to a Profile via a new `profileId`.
- `LocalStorageManager` already writes atomically and caches; `HistoryManager` already writes atomically and is pure Node. We reuse both patterns.
- The preservation tests in `tests/unit/preservation.test.ts` assert `webPreferences.partition === 'persist:neutrino'` for the default case and compare `decideWindowOpen` against the original fixture. The popup partition must therefore **default to `persist:neutrino` when no profile context is supplied**, so the existing property keeps passing.
- Permission handlers today auto-grant every request (`setPermissionCheckHandler(() => true)`), so per-profile "permission grants" (R1.4) hold no stored state; isolation comes from distinct partitions.
- `resolveShortcut` is compared against `tests/unit/fixtures/original` only for untouched inputs; only Ctrl+5..9 and the Ctrl+E action semantics change (A1/A2). `toggle-tabs` action name stays; it now toggles the Sidebar.

## Architecture

```
Main process (src/main)
  profiles/
    store.ts           ProfileStore: profiles + spaces + favorites + layout, pure over an injected fs
    partition.ts       partitionForProfile(), resolver helpers (pure)
    migration.ts       migrateToProfiles() + runMigrationOnce() (pure core + fs runner)
  sessions/
    registry.ts        SessionRegistry: ensure(partition) -> applies configurators once
    configurator.ts    SessionConfigurator: adblock, identity/UA, permissions, authhoff hook, vpn
  history/
    registry.ts        HistoryRegistry: one HistoryManager per profile (reuses history.ts)
  passwords/
    vault.ts           Vault: per-profile encrypted credential file (safeStorage), atomic
    model.ts           pure: decideCapture, suggestionsFor, origin normalization, fill tokens
    manager.ts         PasswordManager: capture/save/update/never, autofill, reveal/copy, import
    csv.ts             pure CSV parse/serialize
    chromeImport.ts    best-effort Chrome/Edge import (DPAPI + AES-GCM v10; classify v20)
    osAuth.ts          OS_Authenticator bridge to native Rust (UserConsentVerifier) + fallback
    passwordPreload.ts injected into page webviews: form submit detection + guarded autofill
  archive/
    archiver.ts        selectTabsToArchive(), restore(), prune() (pure) + scheduler
  previews/
    service.ts         PreviewService: capturePage throttle + in-memory store
  topbar/
    color.ts           pure: parseCssColor, resolvePageColor, contrast, pickForeground
  sidebar/
    layout.ts          pure: Layout model (favorites/pinned/today), moves, visibleTabsForSpace

Renderer (src/renderer)
  components/Sidebar.tsx          Arc sidebar (favorites, pinned, today, switcher, DnD, previews)
  components/PasswordPrompt.tsx   save/update prompts
  components/PasswordManagerSection in SettingsPanel.tsx (list, reveal/copy, never list, import)
  topbar tint wiring in App.tsx (CSS variables + 200ms transition)
  hooks/useProfiles.ts, extend useBrowser.ts / types.ts / preload.ts
```

### Data flow for partition resolution

`ProfileStore` is the single source of truth for `profileId -> partition`. Every consumer resolves through it:

- `BrowserManager.createTab/getActiveTab` knows each tab's `spaceId`; `ProfileStore.ownerOf(spaceId)` gives the profile; `partitionForProfile(profileId)` gives the partition string.
- The renderer receives `partition` per tab in `state-update` (new `TabState.partition`) and sets the webview `partition` from it, instead of a constant.
- Popups: `decideWindowOpen` receives an optional `partition` in its context (the opener tab's partition); it falls back to `persist:neutrino` when absent.
- MCP drawer: App passes the active profile's partition to `McpModal`.
- VPN: `VpnController` takes a `getPartitions: () => string[]` callback (the registry's live set) instead of a fixed array, and `verifyPublicIp` takes the active partition.

## Components and Interfaces

### Profiles and storage

Storage lives in `userData/neutrino-data/`. New files alongside the existing `browser-state.json`:

- `profiles.json` — profiles, spaces (with `profileId`), favorites, pinned/today layout, archive and never-lists. One file keeps migration atomic and avoids cross-file consistency bugs.
- `history-<profileId>.json` — per-profile history (Default uses `history.json` for continuity with the existing file).
- `vault-<profileId>.json` — per-profile encrypted vault.
- `.migrated` marker inside `profiles.json` (a `schemaVersion`/`migratedAt` field) rather than a separate file.

```ts
interface Profile {
  id: string;            // 'default' for the migrated profile
  name: string;
  createdAt: number;
}

interface SpaceRecord {
  id: string;
  profileId: string;     // NEW: owning profile
  name: string;
  icon: string;
  color: string;
  order: number;
}

interface TabEntry {
  id: string;
  spaceId: string;
  section: 'pinned' | 'today';
  url: string;
  title: string;
  favicon?: string;
  order: number;
  lastActiveAt: number;  // absolute ms; survives restart (R16.4)
  unloaded?: boolean;    // closed pinned tab keeps entry (R15.3)
}

interface FavoriteEntry { id: string; profileId: string; url: string; title: string; favicon?: string; order: number; }

interface ArchivedTab { id: string; profileId: string; spaceId: string; url: string; title: string; favicon?: string; archivedAt: number; }

interface ProfilesFile {
  schemaVersion: number;
  profiles: Profile[];
  spaces: SpaceRecord[];
  tabs: TabEntry[];
  favorites: FavoriteEntry[];
  archive: ArchivedTab[];
  neverList: Record<string, string[]>; // profileId -> origins (R6.7–6.9)
}
```

App-wide UI preferences (sidebar expanded/auto-hide, RightPinsDock visibility, Archive_Interval) are **not** stored in `profiles.json`. They live in the existing settings object (`normalizeSettings` in `src/main/settings.ts`, persisted in `browser-state.json`), so there is one home per value.

**Storage authority.** Today `browser-state.json` (`LocalStorageManager.PersistedState`) holds only `spaces`, `bookmarks` and `settings`; tabs are kept in memory by `BrowserManager` and are not restored on restart. After migration, `ProfileStore` is the single source of truth for spaces, tabs (pinned and Today), favorites and archive. `BrowserManager` stops calling `storage.saveState({ spaces })`; `browser-state.json` keeps bookmarks and settings; `exportSyncPackage` reads spaces from `ProfileStore`. Persisting `TabEntry` records is new behavior: pinned and Today tabs are restored at startup (needed for R15.2 and R16.4).

`partitionForProfile(id)` (pure, `profiles/partition.ts`):

```ts
export function partitionForProfile(profileId: string): string {
  return profileId === 'default' ? 'persist:neutrino' : `persist:profile-${profileId}`;
}
```

`ProfileStore` exposes pure, synchronous operations over an injected file I/O layer (same pattern as `LocalStorageManager`/`HistoryManager`), so tests pass a fake fs:

```ts
class ProfileStore {
  constructor(io: { read(): ProfilesFile | null; write(f: ProfilesFile): void; clearSession(partition: string): Promise<void>; rmFiles(profileId: string): void; });
  createProfile(name: string): { profile: Profile; space: SpaceRecord };
  renameProfile(id: string, name: string): void;
  deleteProfile(id: string): Promise<void>;     // rejects if last profile
  createSpace(name: string, profileId?: string): SpaceRecord; // defaults to active profile
  deleteSpace(id: string): void;                 // rejects if only space of its profile
  ownerOf(spaceId: string): string;              // profileId
  activeProfileId(): string;                      // owner of active space
  partitionForSpace(spaceId: string): string;
  // layout ops delegate to sidebar/layout.ts
}
```

`deleteProfile` (R1.8): close tabs (notify BrowserManager), `session.fromPartition(partition).clearStorageData()`, delete `history-<id>.json` and `vault-<id>.json`, and remove the profile's spaces/tabs/favorites/archive/never-list from `profiles.json`. Rejects when it is the only profile (R1.9).

### Session registry and configurator

`setupNetworkInterception` in `index.ts` becomes a `SessionRegistry` that owns a `SessionConfigurator`. The configurator holds the behavior currently inlined in `applyInterception` (adblock `onBeforeRequest`, `applyBrowserIdentity`, permission handlers) plus VPN application:

```ts
class SessionRegistry {
  constructor(private configurator: SessionConfigurator) {}
  ensure(partition: string): Electron.Session; // idempotent: configure once, then return
  partitions(): string[];                        // live set, used by VPN + kill switch
  applyToAll(fn: (s: Electron.Session) => void); // identity/UA/shields change propagation
}
```

- `ensure` is called when a Profile_Session is first needed (profile created, migration, or a tab resolves to it), guaranteeing configuration **before any Web_Content loads** (R2.1). The existing `app.on('session-created')` hook stays as a safety net.
- The default session and `persist:neutrino` are configured at startup exactly as today (preserving R21.3/R21.14).
- Shields/identity/UA setting changes call `applyToAll` (R2.8).
- `VpnController` gets `getPartitions: () => registry.partitions()` so proxy/DoH/kill-switch apply to every existing session and any new one (R2.5/R2.6). `verifyPublicIp(partition)` uses the active profile's session (R2.7).

### Popups, OAuth, MCP drawer

- `WindowOpenContext` gains `partition?: string`; `buildPopupWindowOptions(url, mainWindow, partition)` uses `partition ?? 'persist:neutrino'`. `decideWindowOpen` passes the opener tab's partition through. The `deny` branch keeps `createTab.spaceId = opener.spaceId` (already the case), satisfying R3.2. The default-case test stays green because the fallback is `persist:neutrino`.
- The main-process `setWindowOpenHandler` in `index.ts` resolves the opener's partition from the `webContents` -> owning tab -> profile, and passes it in.
- `McpModal` takes a `partition` prop; the assistant `ASSISTANTS` entries drop their hard-coded partition and use it. The webview `key` includes the partition so a profile change remounts the webview in the new session (R3.3/R3.4).

### Per-profile history

`HistoryRegistry` lazily constructs one `HistoryManager` per profile pointed at `history-<id>.json` (Default -> existing `history.json`). `BrowserManager.updateTab/createTab` already call a single `historyManager`; they instead call `registry.for(ownerProfileId(tab))`. The `neutrino:get-history`, `delete-history-entry`, `clear-history` IPC handlers resolve the active profile (R4.2/R4.3/R4.4). The Command_Bar draws suggestions from the same active-profile query path.

### Migration

`migrateToProfiles(legacy)` is a pure function: given the current `browser-state.json` content (`spaces`, `bookmarks`, `settings`), it returns a `ProfilesFile` with:

- one `Default` profile (`id: 'default'`, partition `persist:neutrino`) (R5.2);
- every existing space mapped to a `SpaceRecord` with `profileId: 'default'`, ids/names/icons/colors preserved and `order` taken from the array position (R5.3);
- empty `tabs`, `favorites`, `archive` and `neverList`: the legacy file contains no tabs (tabs are in-memory only today), so there are no legacy tabs or pinned tabs to convert (R5.3/R5.4 are satisfied vacuously for tabs);
- `settings.pinnedSites` (RightPinsDock) and `bookmarks` left untouched in `browser-state.json` (R5.4);
- `schemaVersion` set. New settings keys get their defaults from `normalizeSettings`, not from migration.

`runMigrationOnce(io)` (fs runner):
1. If `profiles.json` exists with current `schemaVersion`, skip (R5.5).
2. Write a backup copy of `browser-state.json` -> `browser-state.backup-<ts>.json` **before** any change (R5.7).
3. Compute the `ProfilesFile` and write it atomically (temp + rename).
4. On any thrown error, leave `browser-state.json` unchanged, log, and fall back to a runtime Default profile on `persist:neutrino` loaded from the pre-migration data (R5.6). History stays in `history.json`.

It runs during `app.whenReady` before the first `createTab` (R5.1).

### Password manager

**Model (`passwords/model.ts`, pure):**

```ts
function normalizeOrigin(url: string): string | null; // scheme://host[:port], lowercased, default ports dropped
function decideCapture(vault: CredView[], neverList: string[], cap: Capture):
  'save' | 'update' | 'touch' | 'suppress';
function suggestionsFor(vault: CredView[], frameOrigin: string): CredView[]; // exact origin, https>=saved scheme
```

- `decideCapture`: `suppress` if origin on never-list; `touch` if origin+username+password all match; `update` if origin+username match but password differs; else `save` (R6.2–6.4, 6.8).
- `suggestionsFor`: exact normalized-origin equality; a credential saved on https is **not** offered to an http frame (R8.4); only the tab's profile vault is consulted (R8.5).

**Vault (`passwords/vault.ts`):** per-profile file. Each credential stores `origin`, `username`, `createdAt`, `lastUsedAt`, and `passwordEnc` (base64 of `safeStorage.encryptString`). Writes are atomic (temp+rename) (R7.5). `safeStorage.isEncryptionAvailable()` is checked before every write; if false, the write is refused and the caller surfaces the error (R7.2). On read, a blob that fails `decryptString` is kept verbatim and marked `unreadable: true`; unreadable credentials are excluded from autofill and shown as unreadable in settings (R7.3). `safeStorage` is injected so tests use a fake cipher (`encrypt = reverse+tag`, `decrypt` inverse, an "unavailable" mode, and a "corrupt" input path).

**Capture and autofill transport (`passwords/passwordPreload.ts`):** a dedicated preload injected into page webviews (kept separate from the main `preload.ts`; `contextIsolation` stays on). No webview has a preload today and `index.ts` has no `will-attach-webview` handler, so a new handler sets `webPreferences.preload` and `nodeIntegrationInSubFrames: true` (required for the preload to run in cross-origin iframes, R8.3; `nodeIntegration` stays off). Assistant drawer webviews are told apart by a marker the `McpModal` webview passes in its `webpreferences` string, and get no password preload. Logins that never fire a form `submit` (fetch/XHR-only sign-in) are detected on a best-effort basis (password field + click on a submit-like button); some sites will not trigger a prompt. It:
- listens for form submits, finds a password field and the nearest username field, and sends `{frameOrigin, username, password}` to main via a dedicated channel (R6.1);
- renders no UI itself; the save/update prompt is Renderer_UI (`PasswordPrompt.tsx`) driven by main (R6.2/R6.3);
- on focus of a login field, asks main for suggestions for the frame origin and shows the username list; selection sends a **fill token** (opaque id) back to main, which returns the username+password for that one token, and the preload sets the field values (R8.1/8.2/8.6). The token is issued only in response to a user selection and is bound to the webContents+frame+origin, so a different frame/origin cannot redeem it (R8.3/8.6).

**PendingCaptureStore:** captured-but-unsaved passwords live only in Main_Process memory and are dropped when their prompt resolves, is dismissed, or expires; they are never written to disk (R6.10).

**Reveal/copy (`passwords/osAuth.ts` + manager):**
- `OSAuthenticator.verify()` calls a native helper for Windows Hello. The `neutrino-native` crate today is a stdin line-protocol URL checker (`neutrino-core.exe`, built by `build.py` and copied to `resources/bin`); nothing in `src/main` calls it, and `Cargo.toml` has no `windows` dependency. The plan adds a one-shot subcommand mode to `neutrino-core.exe` (`verify --hwnd <n> --reason <text>`, `dpapi-unprotect` reading base64 on stdin), spawned with `child_process.execFile`. Because a console helper has no window, verification uses `IUserConsentVerifierInterop::RequestVerificationForWindowAsync` with the main window's HWND (`mainWindow.getNativeWindowHandle()`), so the Hello dialog is parented to Neutrino. The binary path resolves to `process.resourcesPath/bin` when packaged and `native/target/release` in development; a missing binary reports `unavailable`. If Hello/Windows sign-in is unavailable, it reports `unavailable`, and the manager returns a `needs-confirm` result so the Renderer_UI shows a confirmation dialog and proceeds only on confirm (R10.5).
- Reveal: on verified (or confirmed) it sends plaintext for that one credential; the renderer hides it after 30s or when the section closes (R10.2). List and all other IPC never return plaintext (R9.1/R9.2).
- Copy: main writes to the clipboard itself and does **not** send plaintext to the renderer (R10.3); after 30s it clears the clipboard only if it still equals the written password (R10.4). Uses an injected clock+clipboard for tests.
- Cancel/failure withholds and reports failure (R10.6).

**Import (`passwords/csv.ts`, `chromeImport.ts`):**
- CSV: a pure parser handling quoting, embedded commas/newlines, and unicode; columns url/username/password; classification into imported/duplicate/conflict/invalid with counts (R11.1–11.4). Conflicts prompt keep/replace (R11.4).
- Chrome/Edge: read-only copy of `Login Data` SQLite and `Local State`. Decrypt the DPAPI-wrapped `os_crypt` key, then AES-256-GCM decrypt `v10` blobs (R11.5/11.6). A `v20` prefix (App_Bound_Encryption) or any decrypt failure yields a "direct import not possible" result with CSV-export steps (R11.7). `classifyChromeBlob(bytes)` is pure and never throws.
  - SQLite dependency: the project has **no** SQLite library in `node_modules` and ships no native deps. Decision: read `Login Data` with a small dependency-free SQLite3 B-tree reader implemented in `chromeImport.ts` limited to reading the `logins` table (file format is stable), avoiding a native module in an Electron app. If that proves infeasible at implementation time, fall back to requiring the user to export CSV (R11.7 path already exists). This is called out as a risk, not hidden.
- If `safeStorage` is unavailable during import, nothing is imported and the user is told why (R11.8). All plaintext import data is discarded after commit/cancel; source files are opened read-only and left unchanged (R11.9).

### Arc sidebar

`Sidebar.tsx` replaces `NotificationTabs`. App removes the `NotificationTabs` lazy import, the `left-edge-hover-zone`, and the drawer mount (R12.2). The `toggle-tabs` IPC/event now toggles the sidebar (R12.3/A2).

Layout model (`sidebar/layout.ts`, pure) drives rendering and drag/drop:

```ts
interface Layout { favorites: FavoriteEntry[]; pinned: TabEntry[]; today: TabEntry[]; }
function visibleTabsForSpace(file: ProfilesFile, spaceId: string): Layout; // favorites = profile's; pinned/today = space's
function move(file, op: MoveOp): { file: ProfilesFile; needsReload: boolean };
function reorder(section, fromIndex, toIndex): Section;
```

- Sections top-to-bottom: Favorites_Grid, pinned, Today, Space_Switcher (R12.1). No section labels and no empty-state text: an empty section renders nothing, and pinned and Today are separated by a subtle divider. Empty Favorites/pinned sections keep a zero-height drop zone that expands only while a drag is active, so they stay drop targets (R17.1–17.3).
- Auto-hide: `sidebarVisibility(mode, pointerX, overSidebar)` pure helper; shown within 8px of the left edge or while over the sidebar (R12.4). State (expanded/collapsed/autoHide) persisted in settings (`sidebarExpanded`, `sidebarAutoHide`) and restored (R12.5).
- Ctrl+T opens the Command_Bar and creates a Today_Tab in the Active_Space (R12.8). The sidebar has no "+ New Tab" button (removed at the user's request); the Command_Bar is the new tab control. Closing a Today_Tab removes it and pushes to the reopen list (R12.9). Context menu: pin, unpin, add/remove favorite, move to space, duplicate, close (R12.10).
- Space_Switcher is a single horizontal row of space icons, grouped by owning profile with profiles in creation order and groups separated by a subtle gap/divider (R13.1/A9). It shows no names or profile badges; the active icon is highlighted in the space color, and the space name and owning profile are exposed through the tooltip and `aria-label`. Ctrl+1..9 selects the Nth space in switcher order; fewer than N keeps current (R13.4/13.5/A1).
- Space swiping (R13.3): pinned/Today content is a horizontal track of space panes. Favorites stay fixed when the neighboring space has the same profile and slide with the pane otherwise. A pure helper `src/renderer/utils/spaceSwipe.ts` turns wheel deltas into a track offset (moving 1:1, with rubber-band resistance at the first/last space and no wrap) and decides the release target: next/previous past ~30% of pane width or on a velocity flick, otherwise the current space. The track snaps with an eased ~250 ms animation, and icon clicks and Ctrl+N use the same slide. The space color tint crossfades during the slide, and `prefers-reduced-motion` switches instantly. `selectSpace` IPC fires once, when the snap completes. Horizontal wheel over the sidebar is `preventDefault`ed so the page does not navigate back/forward; swipes are ignored during a drag, and vertical-dominant wheel events scroll normally.
- Activating a space activates its last active tab, else first visible, else a new tab (R13.6).

Drag and drop (R17): reorder within a section, move between sections (changing kind), and drop onto a space icon. `move` reports `needsReload = (destProfile !== srcProfile)`; same-profile moves keep the page loaded (R17.4), cross-profile moves reload in the destination session and update the tab's partition (R17.5). Escape cancels and restores the original layout (R17.7). A drop indicator renders at the current position (R17.6).

### Auto-archive

`archiver.ts` pure core:

```ts
function selectTabsToArchive(tabs: TabEntry[], ctx: { now: number; intervalMs: number | null; activeTabId: string | null; audioTabIds: Set<string> }): TabEntry[];
function restore(file, archivedId, now): { file: ProfilesFile; tab: TabEntry };
function prune(archive: ArchivedTab[], now: number): ArchivedTab[]; // keep <= 30 days
```

- Selected iff `section === 'today'` and not active and not playing audio and `now - lastActiveAt > intervalMs` (R16.3/16.5). `intervalMs === null` (never) selects nothing (R16.6). Default 12h (R16.1); options 12h/24h/7d/30d/never in settings (R16.2). Because `lastActiveAt` is an absolute timestamp persisted in `profiles.json`, inactivity counts time while Neutrino was closed (R16.4).
- A scheduler runs `selectTabsToArchive` on an interval and on startup; archived tabs are closed and recorded; `prune` runs on load keeping 30 days (R16.9). Archive list is per-profile, newest first (R16.7); restore reopens into the original space or the active space if gone, and removes the entry (R16.8).

### Hover previews

`PreviewService` (`previews/service.ts`): captures via `webContents.capturePage()` keyed by **tab id** (not URL — fixes the current URL-matching bug in `index.ts`'s `capture-tab-preview` and `NotificationTabs`). Pure throttle: `shouldCapture(lastCapturedAt, now, reason)` accepts a `deactivation` capture always and periodic captures at most once per 30s per awake tab (R18.3/A4). Previews are kept in memory (optionally the owning profile's storage) and deleted when the tab is closed or archived; a sleeping/unloaded tab keeps its last preview (R18.5/18.7). The renderer shows the preview after a 400ms hover with title+URL, hides on leave, and shows a favicon+title placeholder when none exists (R18.1/18.2/18.6). Capture is independent of any drawer (R18.4). New IPC `capture-tab-preview-by-id(tabId)` and `get-tab-preview(tabId)` replace the URL-based call; the preload keeps a compatibility shim.

### RightPinsDock visibility

`SettingsPanel` gains a toggle bound to the `rightPinsDockVisible` setting (default shown) persisted through the existing settings IPC (R19). App renders `RightPinsDock` only when visible; stored `pinnedSites` are untouched when hidden (R19.3).

### Dia-style top bar tint

`topbar/color.ts` (pure): `parseCssColor`, `resolvePageColor(themeColor, sampledColor, isInternalPage)`, `relativeLuminance`, `contrastRatio`, `pickForeground(bg)`.

- On active-tab change / load finish, the renderer reads the page `theme-color` meta via the webview; if absent, it samples the top strip from `capturePage` (R20.1/20.2). Internal pages and undeterminable colors use default theme colors (R20.5/20.6).
- Precedence: internal -> default; else theme-color if valid; else sampled; else default.
- Top bar background is set via CSS variables with a 200ms transition (R20.3/A5). `pickForeground` returns black or white (or a themed pair) with contrast ratio >= 4.5:1 against the background (R20.4). A `did-change-theme-color` listener updates live (R20.7).

## Data Models

Summarized above: `Profile`, `SpaceRecord` (adds `profileId`), `TabEntry` (adds `section`, `lastActiveAt`, `unloaded`), `FavoriteEntry`, `ArchivedTab`, `ProfilesFile`, `Credential` (origin/username/passwordEnc/createdAt/lastUsedAt/unreadable), `NeverList` (per profile, in `profiles.json`). Renderer `TabState` gains `partition`; `Space` gains `profileId`. Settings gain `archiveIntervalHours` (number | 'never', default 12), `rightPinsDockVisible`, `sidebarExpanded`, `sidebarAutoHide` — all added to `normalizeSettings` keeping idempotence.

## Error Handling

- Migration failure: keep original bytes, back up first, log, run on `persist:neutrino` Default (R5.6).
- `safeStorage` unavailable: refuse to save/import and tell the user (R7.2/R11.8).
- Decrypt failure for a stored credential: exclude from autofill, mark unreadable, keep bytes (R7.3).
- OS authenticator unavailable: confirmation-dialog fallback (R10.5); cancel/fail withholds (R10.6).
- Atomic writes everywhere (profiles, vaults, history) so interrupted writes keep prior contents (R7.5).
- Chrome/Edge App_Bound or decrypt failure: report and show CSV steps rather than importing garbage (R11.7).
- Profile deletion guard and space deletion guard reject last-remaining cases (R1.9/R13.9).

## Testing Strategy

Property-based tests use `fast-check` (already a dependency; config `tests/unit/**/*.test.ts`). Each property test runs >= 100 iterations and is tagged `Feature: arc-spaces-profiles-redesign, Property N: <text>`. Pure modules (`partition`, `model`, `csv`, `color`, `layout`, `archiver`, `migration`, `vault` with a fake `safeStorage`) are the main targets. Example/integration criteria (UI render, real Electron sessions, SQLite read) use example and Electron-script tests. The existing suites (`preservation.test.ts`, `settings.test.ts`, `settingsPanel.test.ts`, `shortcuts.test.ts`, `storage.test.ts`, `history.test.ts`, `vpn.test.ts`) must keep passing unchanged; the popup-partition default (`persist:neutrino`) and untouched-shortcut equality are preserved deliberately for this reason.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Profile partition mapping is injective and default-stable

*For any* set of distinct profile ids, `partitionForProfile` produces distinct partition strings, the id `'default'` maps to `'persist:neutrino'`, and no non-default id maps to `'persist:neutrino'`.

**Validates: Requirements 1.1, 5.2**

### Property 2: Tabs resolve to their owning profile's session

*For any* valid profiles/spaces/tabs state, the partition resolved for a tab equals `partitionForProfile(ownerOf(tab.spaceId))`; all spaces owned by one profile resolve to the same partition, and switching to a space changes the active partition to that space's owner's partition.

**Validates: Requirements 1.2, 1.3, 1.12**

### Property 3: Each space is owned by exactly one profile across all operations

*For any* sequence of create-profile, delete-profile, create-space, delete-space and move-space operations on the store, every space references exactly one existing profile, every profile retains at least one space, and new spaces are owned by the selected profile or the active profile when none is selected.

**Validates: Requirements 1.5, 1.10, 1.11, 13.9**

### Property 4: Rename preserves everything but the name

*For any* store state and profile, renaming the profile changes only its name and leaves its partition, owned spaces, favorites, history reference and vault reference unchanged.

**Validates: Requirements 1.6**

### Property 5: Deleting a profile erases exactly that profile's references

*For any* store state with at least two profiles, deleting a profile removes its spaces, tabs, favorites, archive and never-list and no others, and is rejected (state unchanged) when it is the only profile.

**Validates: Requirements 1.8, 1.9**

### Property 6: VPN and configurators target exactly the registered sessions

*For any* set of registered partitions, the VPN target session set equals the default session plus the registry's partitions, and applying a configuration change reaches every registered session exactly once.

**Validates: Requirements 2.5, 2.6, 2.8**

### Property 7: Popups inherit the opener's partition with a safe default

*For any* window-open details and opener context, when the decision is a popup the resulting `webPreferences.partition` equals the opener's partition when supplied and `'persist:neutrino'` otherwise; when the decision is a tab, the new tab's space equals the opener tab's space.

**Validates: Requirements 3.1, 3.2, 21.10**

### Property 8: History is partitioned by owning profile

*For any* sequence of visits recorded across tabs of different profiles, each profile's history contains exactly the visits of its own tabs, a history query for the active profile returns only that profile's entries, and clearing one profile's history leaves other profiles' histories unchanged.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 9: Migration assigns all legacy data to Default and preserves it

*For any* legacy stored state, migration produces exactly one Default profile bound to `persist:neutrino`, assigns every legacy space to it with ids/names/icons/colors and array order preserved, and leaves `settings` (including `pinnedSites`) and `bookmarks` identical.

**Validates: Requirements 5.2, 5.3, 5.4**

### Property 10: Migration is idempotent and fail-safe

*For any* legacy state, running migration on an already-migrated file is a no-op, and *for any* injected write failure at any step the original `browser-state.json` bytes are unchanged and a backup equal to the original was written before any modification.

**Validates: Requirements 5.5, 5.6, 5.7**

### Property 11: Capture decision matches vault and never-list

*For any* vault, never-list and captured submission, `decideCapture` returns `suppress` exactly when the origin is on the never-list, `touch` when origin+username+password all match an existing credential, `update` when origin+username match with a different password, and `save` otherwise.

**Validates: Requirements 6.2, 6.3, 6.4, 6.8**

### Property 12: Never-list add/remove round-trips the decision

*For any* origin, adding it to the never-list then removing it restores `decideCapture` to the result it gave before the add.

**Validates: Requirements 6.7, 6.9**

### Property 13: Unsaved captures never reach disk

*For any* sequence of capture, resolve, dismiss and expire operations, no pending capture remains after its prompt resolves/dismisses/expires, and the vault file bytes never contain any captured plaintext password.

**Validates: Requirements 6.10**

### Property 14: Vault encrypt/decrypt round-trip and plaintext-at-rest exclusion

*For any* set of credentials written with an available cipher, decrypting the stored blobs returns the original passwords and the serialized vault bytes contain none of the plaintext passwords.

**Validates: Requirements 7.1**

### Property 15: Vault refuses to write without encryption

*For any* credential, when the cipher reports encryption unavailable the write is refused and the vault file bytes are unchanged.

**Validates: Requirements 7.2, 11.8**

### Property 16: Unreadable credentials are preserved and excluded

*For any* vault containing blobs that fail to decrypt, those credentials are excluded from autofill suggestions, marked unreadable in the settings list, and rewritten with their stored bytes unchanged.

**Validates: Requirements 7.3**

### Property 17: Vaults are per-profile isolated and atomically written

*For any* sequence of operations on one profile's vault, another profile's vault file is unchanged, and *for any* injected failure during a write the previous vault contents remain intact.

**Validates: Requirements 7.4, 7.5**

### Property 18: Autofill suggestions match the frame origin exactly

*For any* vault and frame origin, `suggestionsFor` returns exactly the credentials whose normalized origin equals the frame origin, drawn only from the tab's profile vault, and never offers an https-saved credential to an http frame.

**Validates: Requirements 8.1, 8.4, 8.5**

### Property 19: Fill tokens are bound to their issuing frame and origin

*For any* issued fill token, redeeming it returns the password only when redeemed from the same webContents, frame and origin it was issued for, and fails otherwise; no code path returns a password without a valid token.

**Validates: Requirements 8.3, 8.6**

### Property 20: Reveal/copy release plaintext only on success and never leak via copy

*For any* authenticator outcome (verified, failed, cancelled, unavailable-then-confirmed, unavailable-then-declined), a reveal returns plaintext exactly when verified or confirmed, a copy never returns plaintext to the renderer in any outcome, and verification is requested exactly once per reveal/copy request.

**Validates: Requirements 9.2, 10.1, 10.3, 10.5, 10.6**

### Property 21: Clipboard clears only when still holding the copied password

*For any* interleaving of external clipboard writes before the timeout, the clipboard is cleared at timeout exactly when it still equals the password that was copied.

**Validates: Requirements 10.4**

### Property 22: Credential list carries no plaintext and search filters correctly

*For any* vault and search text, the list DTO (and its serialized JSON) contains no plaintext password, and filtering returns exactly the credentials whose origin or username contains the search text case-insensitively.

**Validates: Requirements 9.1, 9.5**

### Property 23: CSV import round-trips and classification counts are total

*For any* set of credential rows, serializing to CSV then parsing returns the original rows (including quotes, commas, newlines and unicode), and the imported/duplicate/conflict/invalid counts sum to the number of input rows with each row in exactly one bucket.

**Validates: Requirements 11.1, 11.2, 11.3, 11.4**

### Property 24: Chrome blob classification is total and AES-GCM v10 round-trips

*For any* byte blob, `classifyChromeBlob` returns one of decryptable-v10 / app-bound-v20 / undecryptable without throwing, classifying by the version prefix; and *for any* key, nonce and plaintext, AES-256-GCM decrypt of a v10-framed encryption returns the original plaintext.

**Validates: Requirements 11.6, 11.7**

### Property 25: Sidebar auto-hide visibility is a pure function of pointer and mode

*For any* pointer x-position and over-sidebar flag, the sidebar is shown when auto-hide is off, or when auto-hide is on and (the pointer is within 8px of the left edge or the pointer is over the sidebar), and hidden otherwise.

**Validates: Requirements 12.4**

### Property 26: Ctrl+N selects the Nth space or keeps the current one

*For any* digit N in 1..9 and any space count, selecting by index activates the Nth space in switcher order when at least N spaces exist and leaves the active space unchanged otherwise.

**Validates: Requirements 13.4, 13.5**

### Property 27: Space activation selects the last active tab deterministically

*For any* space state, activating the space selects its last active tab when one exists, otherwise its first visible tab, otherwise creates a new Today_Tab.

**Validates: Requirements 13.6**

### Property 28: Layout state round-trips through storage

*For any* profiles/spaces/favorites/tabs layout, serializing then parsing the profiles file returns an equal layout preserving favorites and pinned order.

**Validates: Requirements 14.5, 15.2, 13.7**

### Property 29: Favorites are shared across a profile's spaces

*For any* profile and any of its spaces, the favorites shown for that space equal the profile's favorites list.

**Validates: Requirements 14.2**

### Property 30: Drag-and-drop moves preserve the tab multiset and set the right section

*For any* layout and move operation (reorder within a section, move between sections, or drop onto a space), the resulting layout contains the same multiset of tabs, the moved tab lands in the target section/space with the target kind (favorite/pinned/today), and other tabs keep their relative order.

**Validates: Requirements 14.1, 14.4, 15.1, 15.5, 17.1, 17.2, 17.3**

### Property 31: Moves reload only across profiles

*For any* move of a tab between spaces, the move reports a reload requirement exactly when the destination space's profile differs from the source space's profile, and in that case the tab's resolved partition becomes the destination profile's partition.

**Validates: Requirements 17.4, 17.5**

### Property 32: Escape cancels a drag back to the original layout

*For any* layout and started drag, cancelling the drag returns the layout equal to the layout before the drag started.

**Validates: Requirements 17.7**

### Property 33: Closing a pinned tab keeps its entry; closing a today tab removes it

*For any* layout, closing a pinned tab keeps its entry marked unloaded and closing a today tab removes it from the layout and adds it to the reopen list, with all other tabs unchanged.

**Validates: Requirements 12.9, 15.3**

### Property 34: Archive selection respects interval, activity, audio and pinning

*For any* set of tabs and context, `selectTabsToArchive` selects exactly the today tabs that are not active, not playing audio, and inactive longer than the interval, selecting nothing when the interval is never and never selecting pinned tabs or favorites.

**Validates: Requirements 16.3, 16.4, 16.5, 16.6, 15.6**

### Property 35: Archive list ordering, restore target, and 30-day pruning

*For any* archive, listing returns entries newest-first, restoring reopens into the original space when it exists and the active space otherwise while removing the entry, and pruning keeps exactly the entries archived within the last 30 days and is idempotent.

**Validates: Requirements 16.7, 16.8, 16.9**

### Property 36: Preview capture is throttled and lifecycle-correct

*For any* sequence of capture requests for an awake tab, deactivation captures are always accepted and periodic captures are accepted at most once per 30 seconds; a preview survives the tab sleeping or unloading and is deleted when the tab is closed or archived.

**Validates: Requirements 18.3, 18.5, 18.7**

### Property 37: Page color precedence and contrast

*For any* theme-color value, sampled color and internal-page flag, `resolvePageColor` returns the default for internal pages or when no color can be determined, the parsed theme-color when valid, otherwise the sampled color; and `pickForeground` always returns a foreground with contrast ratio at least 4.5:1 against the chosen background.

**Validates: Requirements 20.1, 20.2, 20.4, 20.5, 20.6**

### Property 38: Settings normalization stays total and idempotent with new keys

*For any* raw input, `normalizeSettings` returns a valid `archiveIntervalHours` (one of 12/24/168/720/never, default 12), boolean `rightPinsDockVisible`/`sidebarExpanded`/`sidebarAutoHide`, keeps unknown keys, and is idempotent.

**Validates: Requirements 16.1, 16.2, 19.1, 19.4, 12.5, 21.5**

### Property 39: Untouched keyboard shortcuts are unchanged

*For any* keyboard input that is not Ctrl+5 through Ctrl+9, `resolveShortcut` returns the same action as the pre-feature implementation; Ctrl+1..9 resolve to a space-select of index N-1.

**Validates: Requirements 13.4, 21.8**
