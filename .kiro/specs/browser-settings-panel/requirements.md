# Requirements Document

## Introduction

Neutrino has no settings UI today. The main-process state file (`browser-state.json`) already has a `settings` object with defaults for `searchEngine`, `adblockEnabled`, `zenSleepEnabled` and `theme`, but nothing reads them. Dark mode is forced on every page by DarkReader, which fights sites that ship their own dark theme, YouTube in particular.

This feature adds one browser-wide settings panel in the existing Neutrino look, a user-editable dark-mode exclusion list that replaces any hard-coded list of "native dark" sites, a small set of settings that map onto behavior the app already has, and light polish on the surfaces the panel touches.

Out of scope: custom home page, per-site zoom or per-site shields, import and export UI for the sync package, shortcut remapping, the dark-support probe and `NATIVE_DARK_HOSTS` from the `google-signin-youtube-playback-fix` spec, and every other item of that spec.

## Glossary

- **Settings_Panel**: The new renderer panel that shows and edits browser settings.
- **Settings_Store**: The main-process code that loads, validates, saves and broadcasts the `settings` object in `browser-state.json`.
- **Dark_Mode_Injector**: The main-process code that injects, enables and disables DarkReader in webview tabs.
- **Exclusion_List**: The saved list of hostnames on which the Dark_Mode_Injector does not run DarkReader.
- **Host_Match**: A page host matches an Exclusion_List entry when the host equals the entry or ends with `.` followed by the entry, compared in lowercase with a leading `www.` removed.
- **Active_Tab**: The tab currently shown in the browser viewport.
- **Command_Bar**: The existing centered command palette opened with Ctrl+K, Ctrl+L or Ctrl+T.
- **Zen_Resource_Manager**: The existing main-process `ZenResourceManager` that puts inactive tabs to sleep.
- **Shield_Engine**: The existing main-process `BraveShieldEngine`.

## Requirements

### Requirement 1: Open and close the settings panel

**User Story:** As a Neutrino user, I want one place to change browser settings, so that I do not have to hunt through separate popovers.

#### Acceptance Criteria

1. WHEN the user clicks the gear button in the top-right control cluster, THE Settings_Panel SHALL open.
2. WHEN the user runs the "Open Settings" command in the Command_Bar, THE Settings_Panel SHALL open and the Command_Bar SHALL close.
3. WHEN the user navigates to `neutrino://settings`, THE Settings_Panel SHALL open and the Active_Tab URL SHALL stay unchanged.
4. WHEN the user presses Ctrl+Comma while the browser UI or a webview has focus, THE Settings_Panel SHALL open.
5. WHEN the user presses Escape, clicks the close button or clicks outside the panel card, THE Settings_Panel SHALL close.
6. THE Settings_Panel SHALL render with the existing modal overlay, card, header, close-button classes and theme CSS variables, so that the panel follows the active dark or light theme and accent color.

### Requirement 2: Persist and broadcast settings

**User Story:** As a Neutrino user, I want my settings to survive restarts and apply right away, so that I set them once.

#### Acceptance Criteria

1. WHEN the user changes a setting in the Settings_Panel, THE Settings_Store SHALL save the full settings object to `browser-state.json` and keep the saved spaces and bookmarks unchanged.
2. WHEN the app starts, THE Settings_Store SHALL load the saved settings and replace each missing or invalid field with its default value.
3. IF `browser-state.json` is missing or cannot be parsed, THEN THE Settings_Store SHALL use the default settings.
4. WHEN the Settings_Store saves a change, THE Settings_Store SHALL send the updated settings to the renderer, and THE Settings_Panel SHALL show the updated values.
5. THE Settings_Store SHALL keep unknown keys in the saved `settings` object unchanged.

### Requirement 3: Dark-mode exclusion list

**User Story:** As a Neutrino user, I want to list sites that keep their own look in dark mode, so that sites with a good native dark theme are not broken or slowed by forced dark mode.

#### Acceptance Criteria

1. THE Settings_Panel SHALL show every Exclusion_List entry with a remove control.
2. WHEN the user submits a site in the add field, THE Settings_Store SHALL store the entry as a lowercase hostname without scheme, path, query, port or leading `www.`, and SHALL store each hostname at most once.
3. IF the submitted site does not reduce to a valid hostname, THEN THE Settings_Panel SHALL show an inline error under the add field and THE Settings_Store SHALL leave the Exclusion_List unchanged.
4. WHEN the user removes an entry, THE Settings_Store SHALL delete that entry from the Exclusion_List.
5. WHEN no Exclusion_List has been saved, THE Settings_Store SHALL use the default list `["youtube.com"]`, which the user can remove.
6. WHILE dark mode is on, WHEN a webview page reaches DOM-ready and its host has a Host_Match in the Exclusion_List, THE Dark_Mode_Injector SHALL skip loading and enabling DarkReader for that page.
7. WHILE dark mode is on, WHEN an entry is added, THE Dark_Mode_Injector SHALL disable DarkReader in every open webview whose host has a Host_Match with the new entry, without reloading the page.
8. WHILE dark mode is on, WHEN an entry is removed, THE Dark_Mode_Injector SHALL inject and enable DarkReader in every open webview that the removal made eligible, without reloading the page.
9. THE Dark_Mode_Injector SHALL keep skipping `neutrino://` pages, `about:` pages and auth or security URLs, and SHALL enable DarkReader with brightness 100, contrast 95 and sepia 0.
10. THE Dark_Mode_Injector SHALL be the only code that loads DarkReader into webviews.

### Requirement 4: Exclude the current site

**User Story:** As a Neutrino user, I want a one-click way to exclude the site I am on, so that I can fix a badly darkened page without typing its address.

#### Acceptance Criteria

1. WHILE the Active_Tab shows an `http:` or `https:` page with no Host_Match in the Exclusion_List, THE Settings_Panel SHALL show the Active_Tab host with an "Exclude this site" action that adds the host.
2. WHILE the Active_Tab host has a Host_Match in the Exclusion_List, THE Settings_Panel SHALL show a "Use dark mode on this site" action that removes the matching entry.
3. WHEN the user runs the "Toggle Dark Mode for This Site" command in the Command_Bar on an `http:` or `https:` Active_Tab, THE Settings_Store SHALL add the Active_Tab host when it has no Host_Match and remove the matching entry when it has one.
4. IF the Active_Tab is not an `http:` or `https:` page, THEN THE Settings_Panel SHALL hide the current-site action and THE Command_Bar SHALL omit the "Toggle Dark Mode for This Site" command.

### Requirement 5: Other customizations

**User Story:** As a Neutrino user, I want the few settings I care about in the same panel, so that I can tune the browser in one place.

#### Acceptance Criteria

1. WHEN the user picks Dark or Light in the Settings_Panel appearance section, THE Settings_Panel SHALL apply the same theme change as the top-bar theme button.
2. WHEN the user clicks "Theme & accent" in the Settings_Panel, THE Settings_Panel SHALL close and the existing Theme & Appearance modal SHALL open.
3. WHEN the user changes the display name in the Settings_Panel, THE Settings_Panel SHALL save the trimmed name to `neutrino_user_profile.name` in local storage and THE home screen greeting SHALL show the new name without a restart.
4. WHEN the user switches shields on or off in the Settings_Panel, THE Shield_Engine SHALL apply the new state to the next request and THE Settings_Store SHALL save it as `adblockEnabled`.
5. WHEN the app starts, THE Shield_Engine SHALL start in the saved `adblockEnabled` state.
6. WHEN the user toggles shields from the top bar, the Shield modal or the Command_Bar, THE Settings_Store SHALL save the new `adblockEnabled` state.
7. WHEN the user picks a search engine from Google, DuckDuckGo, Bing or Brave Search, THE Command_Bar SHALL build search URLs for non-URL queries with that engine and SHALL label the search row with the engine name.
8. WHILE Zen auto-sleep is off, THE Zen_Resource_Manager SHALL skip putting tabs to sleep for inactivity and THE renderer SHALL skip its periodic Zen optimize pass.
9. WHILE Zen auto-sleep is off, THE Zen_Resource_Manager SHALL keep sleeping and waking tabs on manual request.

### Requirement 6: Polish on touched surfaces

**User Story:** As a Neutrino user, I want the settings surfaces to look finished and tell the truth, so that the browser feels polished.

#### Acceptance Criteria

1. THE Shield modal master toggle SHALL show "ACTIVE" while shields are on and "OFF" while shields are off.
2. THE Settings_Panel SHALL give every control an accessible label and a visible focus ring when focused with the keyboard.
3. THE Settings_Panel SHALL group controls into the sections Appearance, Dark mode exclusions, Privacy, Search and Performance, in that order.
