# Requirements Document

## Introduction

This feature redesigns how Neutrino (Electron 33, React/Vite renderer, TypeScript) manages tabs, spaces and identities, following the Arc browser model, and adds a cosmetic Dia-style top bar.

Today every tab `<webview>`, popup, assistant drawer webview and the VPN public-IP check share one session partition, `persist:neutrino`. The partition is hard-coded in `src/renderer/components/BrowserViewport.tsx` (~line 1006), `src/main/windowOpen.ts:62`, `src/main/vpn.ts:296`, `src/main/index.ts:67` and `:165` (request interception covers only the default session and `persist:neutrino`), and `src/renderer/components/McpModal.tsx:45-73`. The `Space.containerPartition` field in `src/main/sync/storage.ts:10` is stored but unused. Tabs and spaces appear only in the NotificationTabs left-edge drawer (Ctrl+E) and the RightPinsDock. Page previews are captured only while that drawer is open (`NotificationTabs.tsx:105-111`, stored in `TabState.previewImage`). Neutrino has no password manager, and the top bar uses fixed theme colors.

The feature delivers:
- Profiles, each with its own persistent session partition, history and encrypted password vault, with spaces assigned to exactly one profile.
- A built-in per-profile password manager with save/update/never prompts, exact-origin autofill, Windows Hello-gated reveal/copy, and CSV plus best-effort Chrome/Edge import.
- An Arc-style collapsible/auto-hide sidebar that replaces the NotificationTabs drawer: favorites grid, per-space pinned tabs, "Today" unpinned tabs, space switcher, drag and drop, hover page previews, and auto-archive of unpinned tabs.
- A Dia-style top bar that tints to the active page color.

Existing data migrates into a "Default" profile on `persist:neutrino` so no user is logged out.

### Confirmed Decisions

The user confirmed the following decisions during review. They are stated as requirements below:
- A1: Ctrl+1 through Ctrl+9 switch to spaces 1 through 9. This extends the current Ctrl+1..4 binding in `src/main/shortcuts.ts:124-126`.
- A2: Ctrl+E toggles the new Sidebar (previously the NotificationTabs drawer, action `toggle-tabs`).
- A3: The assistant (MCP) drawer webviews follow the active profile's session partition.
- A4: The hover preview delay is 400 ms and previews refresh at most once every 30 seconds per awake tab.
- A5: Top bar color transitions take 200 ms.
- A6: The default Archive_Interval is 12 hours, with options 12 hours, 24 hours, 7 days, 30 days and never. Archived_Tabs are kept for 30 days.
- A7: Revealed passwords are hidden again after 30 seconds, and a copied password is cleared from the clipboard after 30 seconds.
- A8: The auto-hide Sidebar appears when the pointer is within 8 pixels of the left window edge.
- A9: The Space_Switcher groups Spaces by owning Profile, with Profiles in creation order.
- A10: Pinned_Tabs and Today_Tabs are restored on restart (Requirements 15.2 and 16.4).
- A11: When Windows Hello and Windows sign-in verification are unavailable, reveal and copy fall back to a confirmation dialog (Requirement 10.5).
- A12: Direct Chrome/Edge password import is best effort, with CSV import as the fallback (Requirement 11.7).

## Glossary

- **Neutrino**: The Electron desktop browser in this workspace, consisting of the Main_Process and the Renderer_UI.
- **Main_Process**: The Electron main process code under `src/main`.
- **Renderer_UI**: The React browser chrome under `src/renderer` (sidebar, top bar, modals, settings), excluding web page content.
- **Web_Content**: Any page loaded in a tab `<webview>`, popup window or assistant drawer webview, including the page's JavaScript.
- **Profile**: A named identity that owns one Profile_Session, one profile history, one Password_Vault, one favorites list and one or more Spaces.
- **Default_Profile**: The Profile named "Default" created by Migration, bound to the `persist:neutrino` partition.
- **Active_Profile**: The Profile that owns the currently active Space.
- **Profile_Session**: The Electron persistent session partition owned by one Profile, holding that Profile's cookies, local storage, IndexedDB, cache and permission grants.
- **Profile_Manager**: The Main_Process component that creates, renames, deletes and resolves Profiles and their Profile_Sessions.
- **Session_Configurator**: The Main_Process component that applies adblock/shields interception, browser identity and user agent settings, VPN/proxy configuration, permission request handlers and auth handoff to a session.
- **Space**: A named group of tabs with a name, icon and color, owned by exactly one Profile.
- **Active_Space**: The Space whose tabs the Sidebar currently shows.
- **Tab**: A browsing context shown in a `<webview>` that belongs to one Space (or to a Profile's favorites).
- **Favorite**: A Tab entry stored per Profile and shown in the Favorites_Grid of every Space of that Profile.
- **Pinned_Tab**: A Tab entry stored in one Space's pinned section that persists across restarts.
- **Today_Tab**: An unpinned, non-favorite Tab in a Space's "Today" list.
- **Archived_Tab**: A Today_Tab that the Archiver closed, recorded with its URL, title, favicon, Space and archive time so the user can restore the Tab.
- **Archive_Interval**: The user setting for how long a Today_Tab may stay inactive before archiving: 12 hours, 24 hours, 7 days, 30 days, or never. The default is 12 hours.
- **Archiver**: The component that archives Today_Tabs whose inactivity exceeds the Archive_Interval.
- **Sidebar**: The new Arc-style vertical panel in the Renderer_UI that contains, top to bottom, the Favorites_Grid, the pinned section, the Today list and the Space_Switcher.
- **Favorites_Grid**: The grid of Favorite icons at the top of the Sidebar.
- **Space_Switcher**: The row of Space icons at the bottom of the Sidebar.
- **Tab_Preview**: The page preview image shown when the pointer hovers a Tab in the Sidebar.
- **Preview_Service**: The component that captures, stores and serves Tab_Preview images.
- **Zen_Sleep**: The existing feature that unloads idle Tabs and reloads them on activation.
- **NotificationTabs_Drawer**: The existing left-edge tab-stack drawer opened with Ctrl+E or left-edge hover (`NotificationTabs.tsx`).
- **RightPinsDock**: The existing dock of pinned items on the right edge of the window.
- **Command_Bar**: The existing command bar for search, URL navigation and commands.
- **Settings_Panel**: The existing settings panel in the Renderer_UI.
- **Password_Manager**: The Main_Process component that detects login submissions, stores, matches, fills, reveals, imports and deletes credentials.
- **Password_Vault**: The per-Profile store of credentials, encrypted at rest.
- **Credential**: A saved record of origin, username, password, creation time and last-used time.
- **Never_List**: The per-Profile list of origins for which the user chose "Never for this site".
- **Origin**: The scheme, host and port of a URL.
- **Login_Form**: A form in Web_Content that contains at least one password input field.
- **Safe_Storage**: Electron `safeStorage`, which uses Windows DPAPI on Windows.
- **OS_Authenticator**: The native Windows integration that verifies the user with Windows Hello or Windows sign-in credentials.
- **Password_Importer**: The component that imports Credentials from a CSV file or from a local Chrome or Edge profile.
- **App_Bound_Encryption**: The Chrome 127+ (and equivalent Edge) encryption scheme for saved passwords that third-party applications cannot decrypt.
- **Top_Bar**: The floating top chrome capsule above the page that holds navigation controls, the address display and window controls.
- **Page_Color**: The color derived from the active page's `theme-color` meta value, or, if that is absent, sampled from the top edge of the rendered page.
- **Internal_Page**: A page with a `neutrino://` URL, such as new tab, welcome or settings.
- **Migration**: The one-time conversion of pre-feature stored data into the Profile model.
- **MCP_Drawer**: The existing assistant drawer (`McpModal.tsx`) that hosts assistant provider webviews with MCP integration.

## Requirements

### Requirement 1: Profiles and session isolation

**User Story:** As a user with separate work and personal identities, I want profiles with fully separate browsing data, so that I can be signed in to different accounts on the same site at the same time without data leaking between them.

#### Acceptance Criteria

1. THE Profile_Manager SHALL bind each Profile to exactly one Profile_Session with a partition name unique to that Profile.
2. WHEN a Tab is created or loaded, THE Neutrino SHALL load the Tab in the Profile_Session of the Profile that owns the Tab's Space.
3. THE Neutrino SHALL let Spaces of the same Profile share that Profile's Profile_Session.
4. THE Profile_Manager SHALL keep cookies, local storage, IndexedDB, cache and permission grants of one Profile_Session unreadable from every other Profile_Session.
5. WHEN the user creates a Profile with a name, THE Profile_Manager SHALL create the Profile, create its Profile_Session, and create one Space owned by the new Profile.
6. WHEN the user renames a Profile, THE Profile_Manager SHALL store the new name and keep the Profile's Profile_Session, history, Password_Vault, favorites and Spaces unchanged.
7. WHEN the user requests deletion of a Profile, THE Renderer_UI SHALL show a confirmation dialog stating that the Profile's browsing data, history, saved passwords, favorites and Spaces will be erased.
8. WHEN the user confirms deletion of a Profile, THE Profile_Manager SHALL close the Profile's Tabs and erase the Profile's Profile_Session storage, history, Password_Vault, Never_List, favorites, Archived_Tabs and Spaces.
9. IF the user requests deletion of the only remaining Profile, THEN THE Profile_Manager SHALL reject the deletion and THE Renderer_UI SHALL tell the user that the last Profile cannot be deleted.
10. THE Neutrino SHALL assign each Space to exactly one Profile.
11. WHEN the user creates a Space, THE Neutrino SHALL assign the Space to the Profile the user selects, defaulting to the Active_Profile.
12. WHEN the user switches to a Space owned by a different Profile, THE Neutrino SHALL show that Space's Tabs loaded in the new Active_Profile's Profile_Session.

### Requirement 2: Session configuration for every profile

**User Story:** As a user, I want shields, identity, VPN and sign-in support to work the same in every profile, so that switching profiles does not reduce privacy or break sites.

#### Acceptance Criteria

1. WHEN a Profile_Session is created, THE Session_Configurator SHALL apply the adblock/shields request interception to the Profile_Session before any Web_Content loads in the Profile_Session.
2. WHEN a Profile_Session is created, THE Session_Configurator SHALL apply the browser identity and user agent settings to the Profile_Session.
3. WHEN a Profile_Session is created, THE Session_Configurator SHALL apply the permission request and permission check handlers to the Profile_Session.
4. WHEN a Profile_Session is created, THE Session_Configurator SHALL apply the auth handoff behavior to the Profile_Session.
5. WHILE a VPN or proxy is configured, THE Session_Configurator SHALL apply the VPN/proxy configuration to every Profile_Session.
6. WHEN the VPN or proxy configuration changes, THE Session_Configurator SHALL apply the new configuration to every existing Profile_Session.
7. WHEN the VPN public-IP check runs, THE Neutrino SHALL run the check through the Active_Profile's Profile_Session.
8. WHEN a shields, identity or user agent setting changes, THE Session_Configurator SHALL apply the change to every existing Profile_Session.

### Requirement 3: Popups, OAuth windows and the assistant drawer

**User Story:** As a user signing in with OAuth from a non-default profile, I want popups to stay in the same profile, so that the sign-in result reaches the page that opened the popup.

#### Acceptance Criteria

1. WHEN a Tab opens a popup or OAuth window, THE Neutrino SHALL create the popup or OAuth window in the opener Tab's Profile_Session.
2. WHEN a popup opened from a Tab is converted into a new Tab, THE Neutrino SHALL place the new Tab in the opener Tab's Space.
3. WHEN the MCP_Drawer loads assistant provider webviews, THE MCP_Drawer SHALL load the webviews in the Active_Profile's Profile_Session (decision A3).
4. WHEN the Active_Profile changes while the MCP_Drawer is open, THE MCP_Drawer SHALL reload the assistant provider webviews in the new Active_Profile's Profile_Session.

### Requirement 4: Per-profile history

**User Story:** As a user, I want history kept per profile, so that one identity's browsing does not appear in another's.

#### Acceptance Criteria

1. WHEN a navigation is recorded, THE Neutrino SHALL store the history entry in the history of the Profile that owns the Tab.
2. WHEN the user opens the history view, THE Renderer_UI SHALL show only the Active_Profile's history entries.
3. WHEN the Command_Bar shows history suggestions, THE Command_Bar SHALL draw the suggestions only from the Active_Profile's history.
4. WHEN the user clears history, THE Neutrino SHALL clear only the Active_Profile's history.

### Requirement 5: Migration of existing data

**User Story:** As an existing Neutrino user, I want my current spaces, tabs, history and logins kept after the update, so that I am not logged out and lose nothing.

#### Acceptance Criteria

1. WHEN Neutrino starts with stored data that has no Profile records, THE Neutrino SHALL run Migration once before the first Tab loads.
2. WHEN Migration runs, THE Neutrino SHALL create the Default_Profile bound to the `persist:neutrino` partition.
3. WHEN Migration runs, THE Neutrino SHALL assign every existing Space, and all existing history entries, to the Default_Profile.
4. WHEN Migration runs, THE Neutrino SHALL keep bookmarks and RightPinsDock items unchanged. (Pre-feature Neutrino does not persist tabs, so there are no stored tabs or pinned tabs to migrate.)
5. WHEN Migration completes, THE Neutrino SHALL record a migration marker so that Migration does not run again.
6. IF Migration fails, THEN THE Neutrino SHALL keep the pre-migration data unchanged, log the error, and start with the pre-migration data loaded into the Default_Profile on `persist:neutrino`.
7. WHEN Migration runs, THE Neutrino SHALL write a backup copy of the pre-migration stored data before changing the stored data.

### Requirement 6: Login detection and save prompts

**User Story:** As a user, I want Neutrino to offer to save passwords when I sign in, so that I do not have to remember them.

#### Acceptance Criteria

1. WHEN the user submits a Login_Form on an http or https page, THE Password_Manager SHALL capture the Origin, username and password from the submission.
2. WHEN a captured submission has no matching Credential for the Origin and username in the Active_Profile's Password_Vault, THE Renderer_UI SHALL show a save prompt with the options "Save", "Never for this site" and "Not now".
3. WHEN a captured submission matches a saved Credential's Origin and username but has a different password, THE Renderer_UI SHALL show an update prompt with the options "Update" and "Not now".
4. WHEN a captured submission matches a saved Credential's Origin, username and password, THE Password_Manager SHALL update the Credential's last-used time and show no prompt.
5. WHEN the user chooses "Save", THE Password_Manager SHALL store the Credential in the Password_Vault of the Profile that owns the Tab.
6. WHEN the user chooses "Update", THE Password_Manager SHALL replace the stored password of the matching Credential.
7. WHEN the user chooses "Never for this site", THE Password_Manager SHALL add the Origin to the Active_Profile's Never_List.
8. WHILE an Origin is on the Active_Profile's Never_List, THE Password_Manager SHALL suppress save prompts for that Origin.
9. WHEN the user removes an Origin from the Never_List in the Settings_Panel, THE Password_Manager SHALL resume save prompts for that Origin.
10. THE Password_Manager SHALL hold captured passwords that the user has not saved only in Main_Process memory and SHALL discard each one when its prompt closes.

### Requirement 7: Encrypted password vault

**User Story:** As a user, I want saved passwords encrypted on disk, so that someone who copies my files cannot read them.

#### Acceptance Criteria

1. WHEN the Password_Manager writes a Credential, THE Password_Manager SHALL encrypt the password with Safe_Storage before writing the Credential to disk.
2. IF Safe_Storage reports that encryption is unavailable, THEN THE Password_Manager SHALL refuse to store the Credential and THE Renderer_UI SHALL tell the user that passwords cannot be saved because system encryption is unavailable.
3. IF a stored Credential fails to decrypt, THEN THE Password_Manager SHALL exclude the Credential from autofill, mark the Credential as unreadable in the Settings_Panel list, and keep the stored bytes unchanged.
4. THE Password_Manager SHALL store each Profile's Password_Vault separately from every other Profile's Password_Vault.
5. THE Password_Manager SHALL write Password_Vault files atomically, so that an interrupted write leaves the previous Password_Vault contents intact.

### Requirement 8: Autofill

**User Story:** As a user, I want saved logins filled on the right site, so that signing in is fast and phishing pages get nothing.

#### Acceptance Criteria

1. WHEN the user focuses a username or password field of a Login_Form whose frame Origin exactly matches the Origin of one or more Credentials in the Active_Profile's Password_Vault, THE Password_Manager SHALL show a suggestion list of the matching usernames.
2. WHEN the user selects a username from the suggestion list, THE Password_Manager SHALL fill the username field and the password field of that Login_Form.
3. WHEN a Login_Form is in a frame whose Origin differs from the top-level page Origin, THE Password_Manager SHALL fill the Login_Form only after the user selects a suggestion, and only with Credentials whose Origin matches the frame Origin.
4. IF a Login_Form's frame Origin uses the http scheme and the Credential was saved on an https Origin, THEN THE Password_Manager SHALL offer no suggestion for that Credential.
5. THE Password_Manager SHALL offer only Credentials from the Password_Vault of the Profile that owns the Tab.
6. THE Password_Manager SHALL deliver a password to Web_Content only by setting the value of the matching password input field after the user selects a suggestion.
7. WHEN a Credential is filled, THE Password_Manager SHALL update the Credential's last-used time.

### Requirement 9: Password management in Settings

**User Story:** As a user, I want to see and manage saved passwords, so that I can remove old ones and look up a password when needed.

#### Acceptance Criteria

1. WHEN the user opens the passwords section of the Settings_Panel, THE Renderer_UI SHALL list the Active_Profile's Credentials by Origin and username, without password plaintext.
2. THE Password_Manager SHALL send password plaintext to the Renderer_UI only in response to a reveal action that passed verification under Requirement 10.
3. WHEN the user deletes a Credential, THE Password_Manager SHALL remove the Credential from the Active_Profile's Password_Vault.
4. WHEN the user edits the username or password of a Credential, THE Password_Manager SHALL store the edited Credential encrypted under Requirement 7.
5. WHEN the user filters the list with search text, THE Renderer_UI SHALL show only Credentials whose Origin or username contains the search text.
6. THE Settings_Panel SHALL show the Active_Profile's Never_List with an option to remove each Origin.

### Requirement 10: Verified reveal and copy

**User Story:** As a user, I want password reveal and copy protected by Windows Hello, so that someone at my unlocked computer cannot read my passwords.

#### Acceptance Criteria

1. WHEN the user requests reveal or copy of a Credential's password, THE Password_Manager SHALL request user verification from the OS_Authenticator through Windows Hello or Windows sign-in.
2. WHEN the OS_Authenticator verifies the user for a reveal request, THE Password_Manager SHALL send the password plaintext to the Renderer_UI for that one Credential, and THE Renderer_UI SHALL hide the plaintext again after 30 seconds or when the passwords section closes.
3. WHEN the OS_Authenticator verifies the user for a copy request, THE Password_Manager SHALL write the password to the system clipboard from the Main_Process without sending the plaintext to the Renderer_UI.
4. WHEN the Password_Manager has written a password to the clipboard, THE Password_Manager SHALL clear the clipboard after 30 seconds if the clipboard still contains that password.
5. IF the OS_Authenticator reports that Windows Hello and Windows sign-in verification are unavailable, THEN THE Renderer_UI SHALL show a confirmation dialog, and THE Password_Manager SHALL perform the reveal or copy only after the user confirms.
6. IF the user cancels or fails verification, THEN THE Password_Manager SHALL withhold the password and THE Renderer_UI SHALL show that verification did not succeed.

### Requirement 11: Password import

**User Story:** As a user moving from Chrome or Edge, I want to import my passwords, so that I can start using Neutrino's autofill right away.

#### Acceptance Criteria

1. WHEN the user selects a CSV file in the password import dialog, THE Password_Importer SHALL import each row that has a URL, username and password into the Active_Profile's Password_Vault, encrypted under Requirement 7.
2. WHEN a CSV import completes, THE Renderer_UI SHALL show the number of Credentials imported, the number skipped as duplicates and the number rejected as invalid.
3. WHEN an imported row matches an existing Credential's Origin, username and password, THE Password_Importer SHALL skip the row as a duplicate.
4. WHEN an imported row matches an existing Credential's Origin and username with a different password, THE Password_Importer SHALL ask the user whether to keep the existing password or replace the existing password.
5. WHEN the user chooses direct import from Chrome or Edge, THE Password_Importer SHALL read the browser's local profile data in read-only mode.
6. WHEN the Password_Importer can decrypt the Chrome or Edge password data, THE Password_Importer SHALL import the decrypted Credentials into the Active_Profile's Password_Vault.
7. IF the Password_Importer detects App_Bound_Encryption or fails to decrypt the Chrome or Edge password data, THEN THE Renderer_UI SHALL tell the user that direct import is not possible and SHALL show steps to export a CSV from that browser.
8. IF Safe_Storage encryption is unavailable during import, THEN THE Password_Importer SHALL import nothing and THE Renderer_UI SHALL tell the user why.
9. WHEN an import finishes or fails, THE Password_Importer SHALL discard all plaintext import data from memory and leave the source files unchanged.

### Requirement 12: Arc-style sidebar

**User Story:** As a user, I want a persistent vertical sidebar with my favorites, pinned tabs, today's tabs and spaces, so that I can see and switch tabs at a glance.

#### Acceptance Criteria

1. THE Renderer_UI SHALL show the Sidebar on the left of the browser window, containing from top to bottom the Favorites_Grid, the Active_Space's Pinned_Tabs, the Active_Space's Today_Tabs and the Space_Switcher.
2. THE Neutrino SHALL remove the NotificationTabs_Drawer and its left-edge hover trigger.
3. WHEN the user presses Ctrl+E, THE Renderer_UI SHALL toggle the Sidebar between expanded and collapsed (decision A2).
4. WHERE the auto-hide option is enabled, THE Renderer_UI SHALL hide the Sidebar and show the Sidebar while the pointer is within 8 pixels of the left window edge or over the Sidebar.
5. WHEN the user changes the Sidebar's expanded, collapsed or auto-hide state, THE Neutrino SHALL persist the state and restore the state on next start.
6. WHEN the user clicks a Tab in the Sidebar, THE Neutrino SHALL activate the Tab.
7. THE Sidebar SHALL show each Tab's favicon and title, and SHALL mark the active Tab and sleeping Tabs visually.
8. WHEN the user clicks the new tab control in the Sidebar or presses Ctrl+T, THE Renderer_UI SHALL open the Command_Bar, and THE Neutrino SHALL create the resulting Tab as a Today_Tab in the Active_Space.
9. WHEN the user closes a Today_Tab, THE Neutrino SHALL remove the Today_Tab from the Sidebar and add the Today_Tab to the reopen-closed-tab list.
10. THE Sidebar SHALL provide a context menu on each Tab with the actions pin, unpin, add to favorites, remove from favorites, move to Space, duplicate and close.

### Requirement 13: Spaces and space switching

**User Story:** As a user, I want Arc-style spaces with a name, icon and color, so that I can separate projects and switch between them fast.

#### Acceptance Criteria

1. THE Space_Switcher SHALL show one icon per Space of every Profile, grouped by owning Profile with Profiles in creation order, and SHALL show which Profile owns each Space (decision A9).
2. WHEN the user clicks a Space icon in the Space_Switcher, THE Neutrino SHALL make that Space the Active_Space.
3. WHEN the user performs a horizontal two-finger swipe over the Sidebar, THE Neutrino SHALL make the next or previous Space the Active_Space.
4. WHEN the user presses Ctrl+N where N is a digit from 1 to 9, THE Neutrino SHALL make the Nth Space in Space_Switcher order the Active_Space (decision A1).
5. IF the user presses Ctrl+N and fewer than N Spaces exist, THEN THE Neutrino SHALL keep the current Active_Space.
6. WHEN a Space becomes the Active_Space, THE Renderer_UI SHALL show the Space's name, icon and color, and THE Neutrino SHALL activate the Space's last active Tab.
7. WHEN the user creates, renames, recolors, changes the icon of, reorders or deletes a Space, THE Neutrino SHALL persist the change.
8. WHEN the user requests deletion of a Space that contains Tabs, THE Renderer_UI SHALL ask for confirmation before THE Neutrino closes the Space's Tabs and deletes the Space.
9. IF the user requests deletion of the only Space of a Profile, THEN THE Neutrino SHALL reject the deletion and THE Renderer_UI SHALL tell the user that each Profile needs at least one Space.

### Requirement 14: Favorites

**User Story:** As a user, I want a favorites grid shared by all spaces of a profile, so that my most-used sites are always one click away.

#### Acceptance Criteria

1. WHEN the user adds a Tab to favorites, THE Neutrino SHALL store the Favorite in the favorites list of the Profile that owns the Tab.
2. THE Favorites_Grid SHALL show the Active_Profile's Favorites in every Space of the Active_Profile.
3. WHEN the user clicks a Favorite, THE Neutrino SHALL activate the Favorite's Tab, loading the Favorite's URL in the Active_Profile's Profile_Session if the Tab is not loaded.
4. WHEN the user removes a Favorite, THE Neutrino SHALL delete the Favorite from the Profile's favorites list.
5. THE Neutrino SHALL persist each Profile's Favorites and their order across restarts.

### Requirement 15: Pinned tabs

**User Story:** As a user, I want pinned tabs per space, so that the tabs I always need in a project stay there.

#### Acceptance Criteria

1. WHEN the user pins a Tab, THE Neutrino SHALL move the Tab to the pinned section of the Tab's Space.
2. THE Neutrino SHALL persist each Space's Pinned_Tabs, their URLs and their order across restarts.
3. WHEN the user closes a Pinned_Tab, THE Neutrino SHALL unload the Pinned_Tab's page and keep the Pinned_Tab entry in the pinned section.
4. WHEN the user clicks an unloaded Pinned_Tab, THE Neutrino SHALL load the Pinned_Tab's saved URL.
5. WHEN the user unpins a Pinned_Tab, THE Neutrino SHALL move the Tab to the Today list of the same Space.
6. THE Archiver SHALL exclude Pinned_Tabs and Favorites from archiving.

### Requirement 16: Auto-archive of Today tabs

**User Story:** As a user, I want old unpinned tabs archived automatically, so that my sidebar stays clean without losing anything.

#### Acceptance Criteria

1. THE Neutrino SHALL use 12 hours as the default Archive_Interval.
2. THE Settings_Panel SHALL let the user set the Archive_Interval to 12 hours, 24 hours, 7 days, 30 days or never.
3. WHEN a Today_Tab has been inactive for longer than the Archive_Interval, THE Archiver SHALL close the Today_Tab and record the Today_Tab as an Archived_Tab.
4. THE Archiver SHALL measure inactivity from the time the Today_Tab was last the active Tab, including time while Neutrino was closed.
5. THE Archiver SHALL exclude the currently active Tab and Tabs playing audio from archiving.
6. WHILE the Archive_Interval is set to never, THE Archiver SHALL archive no Tabs.
7. WHEN the user opens the archive list, THE Renderer_UI SHALL show the Active_Profile's Archived_Tabs with title, URL, Space and archive time, newest first.
8. WHEN the user restores an Archived_Tab, THE Neutrino SHALL reopen the Archived_Tab's URL as a Today_Tab in the Archived_Tab's original Space, or in the Active_Space if the original Space no longer exists, and remove the entry from the archive list.
9. THE Neutrino SHALL persist Archived_Tabs per Profile across restarts and keep each Archived_Tab for 30 days after the archive time.

### Requirement 17: Drag and drop

**User Story:** As a user, I want to drag tabs to reorder them and move them between sections and spaces, so that organizing tabs is direct.

#### Acceptance Criteria

1. WHEN the user drags a Tab within the Favorites_Grid, pinned section or Today list and drops the Tab, THE Neutrino SHALL reorder the section to place the Tab at the drop position and persist the order.
2. WHEN the user drags a Tab between the Favorites_Grid, pinned section and Today list, THE Neutrino SHALL make the Tab a Favorite, Pinned_Tab or Today_Tab to match the target section.
3. WHEN the user drops a Tab onto a Space icon in the Space_Switcher, THE Neutrino SHALL move the Tab into that Space's Today list, or into that Space's pinned section if the Tab was a Pinned_Tab.
4. WHEN a Tab is moved to a Space owned by the same Profile, THE Neutrino SHALL keep the Tab's page loaded without reloading.
5. WHEN a Tab is moved to a Space owned by a different Profile, THE Neutrino SHALL reload the Tab's URL in the destination Profile's Profile_Session.
6. WHEN a drag is in progress, THE Sidebar SHALL show a drop indicator at the current drop position.
7. WHEN the user presses Escape during a drag, THE Sidebar SHALL cancel the drag and leave every Tab in its original position.

### Requirement 18: Hover page previews

**User Story:** As a user, I want to see a preview of a tab when I hover it, so that I can find the right tab without switching to it.

#### Acceptance Criteria

1. WHEN the pointer rests on a Tab in the Sidebar for 400 ms, THE Renderer_UI SHALL show the Tab_Preview next to the Tab with the Tab's title and URL (decision A4).
2. WHEN the pointer leaves the Tab and the Tab_Preview, THE Renderer_UI SHALL hide the Tab_Preview.
3. WHILE a Tab is awake, THE Preview_Service SHALL capture the Tab's page image when the Tab is deactivated and at most once every 30 seconds while the Sidebar shows the Tab (decision A4).
4. THE Preview_Service SHALL capture previews independently of whether any drawer is open.
5. WHEN a Tab is put to sleep by Zen_Sleep or unloaded, THE Preview_Service SHALL keep the Tab's last captured preview, and THE Renderer_UI SHALL show that preview on hover.
6. IF no preview exists for a Tab, THEN THE Renderer_UI SHALL show a placeholder with the Tab's favicon and title.
7. THE Preview_Service SHALL keep preview images in memory or in the owning Profile's storage only, and SHALL delete a Tab's preview when the Tab is closed or archived.

### Requirement 19: RightPinsDock visibility

**User Story:** As a user, I want to show or hide the RightPinsDock, so that I can keep the window clean when I do not use the dock.

#### Acceptance Criteria

1. THE Settings_Panel SHALL provide a toggle that shows or hides the RightPinsDock, defaulting to shown.
2. WHILE the RightPinsDock toggle is set to shown, THE Renderer_UI SHALL show the RightPinsDock with its existing behavior.
3. WHILE the RightPinsDock toggle is set to hidden, THE Renderer_UI SHALL hide the RightPinsDock and keep its stored items.
4. WHEN the user changes the RightPinsDock toggle, THE Neutrino SHALL persist the setting and restore the setting on next start.

### Requirement 20: Dia-style top bar tint

**User Story:** As a user, I want the top bar to match the color of the page, so that the browser chrome blends with the site.

#### Acceptance Criteria

1. WHEN a web Tab becomes active or finishes loading, THE Renderer_UI SHALL set the Top_Bar background to the active page's `theme-color` meta value.
2. IF the active page has no valid `theme-color` meta value, THEN THE Renderer_UI SHALL set the Top_Bar background to the color sampled from the top edge of the rendered page.
3. WHEN the Top_Bar background color changes, THE Renderer_UI SHALL animate the color change over 200 ms (decision A5).
4. THE Renderer_UI SHALL choose Top_Bar icon and text colors that have a contrast ratio of at least 4.5:1 against the Top_Bar background.
5. WHEN an Internal_Page is active, THE Renderer_UI SHALL draw the Top_Bar in the default theme colors.
6. IF the Page_Color cannot be determined, THEN THE Renderer_UI SHALL draw the Top_Bar in the default theme colors.
7. WHEN a page's `theme-color` meta value changes while the page is active, THE Renderer_UI SHALL update the Top_Bar background to the new value.

### Requirement 21: Preservation of existing behavior

**User Story:** As an existing user, I want everything I use today to keep working, so that the redesign does not cost me features.

#### Acceptance Criteria

1. WHEN an existing user starts the updated Neutrino, THE Neutrino SHALL keep the user signed in to every site through the Default_Profile on `persist:neutrino`.
2. WHILE a Tab is idle, THE Neutrino SHALL apply Zen_Sleep to the Tab and wake the Tab on activation, in every Profile.
3. WHEN pages load in any Profile, THE Neutrino SHALL apply shields/adblock blocking, update blocked counts, and keep the ShieldModal working.
4. WHEN the user opens the Command_Bar, THE Command_Bar SHALL provide search, URL navigation and command actions.
5. WHEN the user opens the Settings_Panel, THE Settings_Panel SHALL show and persist all existing settings.
7. WHEN the user opens the MCP_Drawer, THE MCP_Drawer SHALL load the assistant providers and keep their MCP integration working.
8. WHEN the user presses an existing keyboard shortcut, THE Neutrino SHALL perform the same action as before, except for the documented changes to Ctrl+E (decision A2) and Ctrl+5 through Ctrl+9 (decision A1).
9. WHILE a VPN or proxy is configured, THE Neutrino SHALL route traffic through the VPN or proxy and verify the public IP.
10. WHEN a popup or OAuth sign-in window opens from a Tab in the Default_Profile, THE Neutrino SHALL complete sign-in flows, including Google sign-in through authHandoff and googleAuth, as before.
11. WHEN the user navigates, goes back or forward, reloads, zooms, uses the media player or picture-in-picture, or views history, THE Neutrino SHALL behave as before within the Active_Profile.
12. WHEN an Internal_Page is active, THE Renderer_UI SHALL render the default themed chrome and keep the theme customizer and Space theme settings working.
13. WHEN the user uses the minimize, maximize or close window controls, THE Neutrino SHALL perform the matching window action with the redesigned Top_Bar and Sidebar.
14. THE Neutrino SHALL keep the browser identity and permission handler behavior unchanged for the Default_Profile.
