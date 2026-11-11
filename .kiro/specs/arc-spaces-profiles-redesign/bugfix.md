# Bugfix Requirements Document

## Introduction

Neutrino's tab, space and profile management lacks session isolation and the Arc-style UX the user wants. Every tab, popup, assistant drawer webview and the VPN check share one session partition (`persist:neutrino`). As a result, spaces cannot hold separate logins, and there is no notion of a profile. Spaces exist, but the browser shows them only through a hidden left-edge "notification-style tab stack" drawer (Ctrl+E). The browser has no persistent sidebar, no favorites grid, no per-space pinned tabs and no auto-archiving of unpinned tabs. Neutrino has no password manager, and Electron provides none. The floating top bar uses fixed theme colors and does not follow the color of the active page.

This document treats those gaps as the defect. The fix introduces:
- an Arc-style vertical sidebar with spaces, favorites, pinned tabs and a "Today" list, plus hover previews;
- profiles that each map to their own persistent session, with spaces assigned to profiles;
- a per-profile encrypted password manager with save prompts and autofill;
- a cosmetic, Dia-style top bar that tints to match the active page.

Existing features (Zen sleep, shields/adblock, command bar, settings, dark-mode exclusions, MCP drawer, VPN, keyboard shortcuts) must not regress. Existing users must stay logged in after migration.

## Bug Analysis

### Current Behavior (Defect)

**Session isolation and profiles**

1.1 WHEN the user opens tabs in different spaces THEN the system loads all of them in the single shared `persist:neutrino` partition, so cookies, local storage, cache, permissions and logins are shared across every space

1.2 WHEN the user wants separate identities (for example a work and a personal Google account signed in at the same time) THEN the system offers no way to create, rename, delete or select a profile

1.3 WHEN a tab opens a popup or OAuth window THEN the system always creates that window in `persist:neutrino`, regardless of which space or identity the opener tab belongs to

1.4 WHEN the assistant drawer (MCP) webviews or the VPN public-IP check run THEN the system hard-codes `persist:neutrino` for them, so they cannot follow a non-default identity

1.5 WHEN a space defines `containerPartition` in stored data THEN the system ignores the field and loads that space's tabs in the shared partition

1.6 WHEN history entries are recorded THEN the system stores them in one global history, with no per-profile separation

**Password management**

1.7 WHEN the user submits a login form on a website THEN the system does not detect the submission and does not offer to save the credentials

1.8 WHEN the user revisits a login page for which they previously entered credentials THEN the system offers no autofill or suggestion

1.9 WHEN the user opens Settings THEN the system has no place to view, copy, reveal or delete saved passwords

**Arc-style tabs and spaces UX**

1.10 WHEN the user wants to see or switch tabs and spaces THEN the system shows them only in a temporary left-edge drawer (Ctrl+E) and RightPinsDock, with no persistent, collapsible vertical sidebar

1.11 WHEN the user wants to switch spaces THEN the system provides no bottom-of-sidebar space switcher, no swipe gesture and no Ctrl+1..9 space switching

1.12 WHEN the user wants tabs that stay available in every space THEN the system has no favorites grid shared across spaces

1.13 WHEN the user wants tabs that persist in one space THEN the system has no per-space pinned section separate from unpinned tabs

1.14 WHEN unpinned tabs are left unused for a long time THEN the system keeps them open indefinitely, with no auto-archive

1.15 WHEN the user wants to reorder tabs, move a tab to another space, or move a tab between pinned and unpinned THEN the system offers no drag and drop for these actions

1.16 WHEN the user hovers a tab in the tab list THEN the system shows no page preview; previews appear only as cards inside the open drawer

**Top bar appearance**

1.17 WHEN a web page is active THEN the system draws the top bar (floating top chrome capsule) in fixed theme colors that do not match the page

### Expected Behavior (Correct)

**Session isolation and profiles**

2.1 WHEN the user opens tabs in spaces that belong to different profiles THEN the system SHALL load each tab in its profile's own persistent session partition, so cookies, local storage, cache, permissions and logins are isolated between profiles. Spaces in the same profile SHALL share that profile's session

2.2 WHEN the user manages profiles THEN the system SHALL let the user create, rename and delete profiles. Each space SHALL belong to exactly one profile. Deleting a profile SHALL require confirmation and SHALL clear that profile's session data, history and password vault. The last remaining profile SHALL NOT be deletable

2.3 WHEN a tab opens a popup or OAuth window THEN the system SHALL create that window in the opener tab's profile partition, so the sign-in result reaches the opener

2.4 WHEN the user switches to a space in a different profile THEN the system SHALL show that space's tabs using that profile's session, and the assistant drawer webviews SHALL use the active profile's session

2.5 WHEN any profile session is created THEN the system SHALL apply adblock/shields interception, the user agent and browser identity settings, the VPN/proxy configuration, and the permission request handlers to it, exactly as they are applied to `persist:neutrino` today

2.6 WHEN history entries are recorded THEN the system SHALL store them per profile, and history views and command bar history suggestions SHALL show only the active profile's history

2.7 WHEN the system starts for the first time after the update THEN it SHALL migrate all existing spaces, tabs and history into a profile named "Default" that uses the existing `persist:neutrino` partition, so that no user is logged out and no data is lost

**Password management**

2.8 WHEN the user submits a login form (a form with a password field) on an http(s) page THEN the system SHALL show a browser-UI prompt offering "Save", "Never for this site", or "Update" when a different password is already saved for that username on that origin

2.9 WHEN credentials are saved THEN the system SHALL store them in the active profile's vault, encrypted at rest with Electron `safeStorage` (Windows DPAPI). IF `safeStorage` encryption is unavailable THEN the system SHALL refuse to save and SHALL tell the user why (fail closed, never write plaintext)

2.10 WHEN the user focuses a login field on a page whose origin exactly matches (scheme, host and port) a saved credential in the active profile THEN the system SHALL offer the matching usernames as suggestions, and SHALL fill the username and password fields when the user picks one

2.11 WHEN a login form is in a cross-origin iframe THEN the system SHALL NOT autofill it automatically, and SHALL fill it only after an explicit user action and only if the iframe's own origin matches the credential

2.12 WHEN credentials are filled THEN the system SHALL expose the password only through the filled input field. The system SHALL NOT expose stored credentials to page JavaScript through any other channel, SHALL NOT send them to the renderer UI, and SHALL NOT use credentials from another profile

2.13 WHEN the user opens the passwords section in Settings THEN the system SHALL list the active profile's saved sites and usernames without plaintext passwords, and SHALL allow delete, copy and reveal. Reveal and copy SHALL require a confirmation step (re-authentication, if available on the platform) before the plaintext leaves the main process

**Arc-style tabs and spaces UX**

2.14 WHEN the browser window is open THEN the system SHALL show a persistent vertical sidebar that the user can collapse or set to auto-hide (revealed by hovering the window edge). The sidebar SHALL contain, from top to bottom: the favorites grid, the current space's pinned tabs, the "Today" unpinned tab list, and the space switcher

2.15 WHEN the user switches spaces with a space icon in the switcher, a horizontal swipe on the sidebar, or Ctrl+1..9 THEN the system SHALL activate that space, show its name, icon and color/theme, and restore its last active tab

2.16 WHEN a tab is added to favorites THEN the system SHALL show it in the favorites grid in every space within the same profile

2.17 WHEN a tab is pinned in a space THEN the system SHALL keep it in that space's pinned section across restarts. Closing a pinned tab SHALL unload it while keeping the pinned entry

2.18 WHEN an unpinned tab has not been active for longer than the configurable archive interval (default to be confirmed) THEN the system SHALL archive it: close it and keep it in a recoverable archived list. The user SHALL be able to change or disable this interval in Settings

2.19 WHEN the user drags a tab in the sidebar THEN the system SHALL support reordering within a section, moving between pinned/unpinned/favorites, and dropping onto a space icon to move the tab to that space. A move to a space in a different profile SHALL reload the tab in the destination profile's session

2.20 WHEN the user creates a new tab from the sidebar or with Ctrl+T THEN the system SHALL open the command bar and create the tab in the active space

2.21 WHEN the user hovers a tab in the sidebar THEN the system SHALL show a page preview captured with capturePage after a short hover delay. Sleeping (Zen) or unloaded tabs SHALL show their last saved snapshot, or a favicon/title placeholder if no snapshot exists

**Top bar appearance**

2.22 WHEN a web tab is active THEN the system SHALL tint the top bar to the page's `theme-color` meta value or, if that is absent, to a color sampled from the top edge of the page. The transition SHALL be smooth, and icon and text colors SHALL be chosen for readable contrast (at least WCAG AA 4.5:1 for text)

2.23 WHEN a `neutrino://` page or a page with no usable color is active THEN the system SHALL use the default theme colors for the top bar

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an existing user starts the updated browser THEN the system SHALL CONTINUE TO keep them signed in to every site they were signed in to, through the Default profile on `persist:neutrino`

3.2 WHEN tabs are idle THEN the system SHALL CONTINUE TO put them to sleep with Zen sleep and wake them on activation, in every profile

3.3 WHEN pages load in any profile THEN the system SHALL CONTINUE TO apply shields/adblock blocking, update blocked counts, and keep the ShieldModal working

3.4 WHEN the user opens the command bar THEN the system SHALL CONTINUE TO provide search, URL navigation and command actions, with history suggestions scoped to the active profile

3.5 WHEN the user opens the Settings panel THEN the system SHALL CONTINUE TO show and persist all existing settings

3.6 WHEN dark mode is enabled with site exclusions THEN the system SHALL CONTINUE TO apply dark mode (Dark Reader) and honor the exclusions in every profile

3.7 WHEN the user opens the MCP/assistant drawer THEN the system SHALL CONTINUE TO load the assistant providers and keep their MCP integration working

3.8 WHEN the user uses existing keyboard shortcuts THEN the system SHALL CONTINUE TO perform the same actions. Where a new binding is needed (for example Ctrl+1..9 for spaces, replacing a tab-index binding, or Ctrl+E for the drawer), the change SHALL be confirmed with the user and documented

3.9 WHEN a VPN or proxy is configured THEN the system SHALL CONTINUE TO route traffic through it and SHALL verify the public IP, now covering every profile session

3.10 WHEN popups or OAuth sign-in windows are opened from a tab in the Default profile THEN the system SHALL CONTINUE TO complete sign-in flows (for example Google sign-in through authHandoff/googleAuth) as they do today

3.11 WHEN the user navigates, goes back or forward, reloads, zooms, uses the media player/PiP, or views history THEN the system SHALL CONTINUE TO behave as before within the active profile

3.12 WHEN the active page is a `neutrino://` page (new tab, welcome, settings) THEN the system SHALL CONTINUE TO render the default themed chrome and the existing theme customizer and space theme settings

3.13 WHEN the window controls (minimize, maximize, close) are used THEN the system SHALL CONTINUE TO work with the redesigned top bar and sidebar
