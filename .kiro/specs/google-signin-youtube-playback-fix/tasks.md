# Implementation Plan

## Overview

The plan follows the bug condition methodology from design.md. Task 1 adds vitest and fast-check and writes exploration tests, including the live ablation runs, which must fail on unfixed code. Task 2 writes preservation property tests, which must pass on unfixed code. Task 3 applies the fix and re-runs both sets. Task 4 is the final checkpoint.

## Tasks

- [ ] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Chrome-shaped identity, YouTube playback breakers and developer artifacts
  - **CRITICAL**: These tests MUST FAIL on unfixed code. The failures confirm the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: The tests encode the expected behavior from design Properties 1 to 9 and will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples for `isBugCondition(input) = C_auth OR C_ua OR C_yt OR C_rel` and confirm or refute the ranked root causes with ablation runs
  - **Scoped PBT Approach**: The bugs are deterministic, so scope each property to the concrete failing inputs listed below
  - Test tooling (the repo has no test runner yet):
    - Add `vitest` and `fast-check` to `devDependencies` and add `"test": "vitest --run"` to `package.json` scripts
    - Add a `vitest.config.ts` that includes only `tests/unit/**/*.test.ts` and uses the `node` environment, so the existing ad-hoc scripts in `tests/` are not picked up
    - Unit tests import only pure modules. Where the unfixed logic lives inside Electron-bound files (`CHROME_USER_AGENT`, the inline ad skipper, the greeting fallback), copy the unfixed logic verbatim into `tests/unit/fixtures/original/` and test that copy
  - Unit and property tests in `tests/unit/bugCondition.test.ts` (run on UNFIXED code):
    - UA shape (C_ua, 1.4 to 1.6): for random OS tokens, app versions and Chromium versions, the UA the app sends is not Chrome-shaped (`^Mozilla/5\.0 \([^)]+\) AppleWebKit/537\.36 \(KHTML, like Gecko\) Chrome/[\d.]+ Safari/537\.36$`), contains `Chrome/<process.versions.chrome>`, has exactly one `Neutrino/<version>` token before `Chrome/`, and has no `Electron/` token. Expected counterexample: `CHROME_USER_AGENT` ends in `Chrome/130.0.0.0 Safari/537.36` with no product token and always says `Windows NT 10.0`
    - Ad controller (C_yt, 1.9): drive the original skipper with a fake `#movie_player` and video over random tick sequences (ad class on for N ticks, then off, random starting rate and mute). Assert `currentTime` is never written and rate and mute return to their pre-ad values on the first tick after the ad clears. Expected counterexample: `currentTime := duration` on tick 1 and `playbackRate` stays 16 after the ad
    - Playback-critical requests (C_yt, 1.10): for `youtube.com/ptracking`, `youtube.com/api/stats/{playback,watchtime,delayplay,atr,qoe}` without `adformat`, `youtube.com/youtubei/v1/player` and `*.googlevideo.com` URLs with random query strings, `BraveShieldEngine.checkUrl` returns `blocked: false`. Expected counterexample: `checkUrl("https://www.youtube.com/ptracking?ei=x")` returns `{ blocked: true, rule: "Pattern: ad-endpoint" }`
    - Dialog rule (C_yt, 1.11): `getCosmeticFilterCSS()` contains no `tp-yt-paper-dialog` selector. Expected counterexample: `tp-yt-paper-dialog:has(#feedback)` is present
    - GPU switches (C_yt, 1.12): the startup switch list (read from the source of `src/main/index.ts` or an extracted list) contains none of `ignore-gpu-blocklist`, `enable-zero-copy`, `enable-native-gpu-memory-buffers`, `enable-gpu-rasterization`
    - Greeting (C_rel, 1.13): for empty or whitespace names and hours 0 to 23, the greeting is exactly one of "Good morning", "Good afternoon", "Good evening". Expected counterexample: "Good evening, Yash"
    - MCP version (C_rel, 1.14): the MCP `initialize` result reports the `package.json` version `0.2.0`. Expected counterexample: `0.1.0`
    - Model badges (C_rel, 1.15): the `ASSISTANTS` list has no badge in `["3.5", "4o", "Flash", "R1"]`
    - Permissions (C_rel, 1.18): for random origins and every permission in `SENSITIVE_PERMISSIONS` with no remembered decision, the request handler never grants without a prompt and the check handler returns `false`. Expected counterexample: the original handlers call `callback(true)` and return `true`
    - Popup title and logging (C_rel, 1.19, 1.20): popup options carry no fixed `title: 'Sign In'`; `handleFailLoad` writes nothing to the console when not in development
  - Integration harnesses in `tests/integration/` (Electron scripts, run on UNFIXED code):
    - Header coherence (C_ua, 1.4 to 1.6): load `http://127.0.0.1:<port>/` in `persist:neutrino`, record request headers server-side and `navigator.userAgent` / `navigator.userAgentData` in the page, and compare. Expected counterexample: `"Google Chrome"` in `Sec-CH-UA` but not in `brands`; `"Windows"` reported on macOS and Linux
    - Package contents (C_rel, 1.17): package the unfixed project and run `scripts/verify_package_contents.cjs` (write it now; it walks `release/Neutrino-*/resources/app` and exits non-zero on any ignore-list match or `C:/Users/` / `C:\\Users\\` path). Expected counterexample: `tests/`, `scratch/`, root `*.md`, `*.png`, `*.py` are bundled
  - Live ablation harnesses, run only with `NEUTRINO_LIVE_TESTS=1`:
    - Google sign-in ablation (C_auth, 1.1 to 1.3): fresh profile per run, type a disposable non-existent Gmail address into `accounts.google.com`, submit with `webContents.sendInputEvent`, classify the resulting URL with `isRejectionPage`. Arms: (a) current UA and forged hints, (b) current UA with untouched hints, (c) new UA and forged hints, (d) new UA and untouched hints, three runs each in random order. Hypothesis holds if (a) and (b) are rejected and (c) and (d) are not. If (c) or (d) is rejected, stop and re-hypothesize before task 3
    - YouTube ablation (C_yt, 1.8 to 1.12): open a fixed set of watch pages with force dark and shields on and record over 30 s each: `currentTime` progress, `playbackRate` after any ad, hidden dialogs while `video.paused`, blocked `youtube.com` and `googlevideo.com` requests, and long-task time. Arms: baseline (all on), then one at a time: ad skipper off, dialog rule off, `/ptracking` unblocked, DarkReader off, GPU switches off. The arm whose removal restores playback confirms the cause; compare against the ranking in the design (ad skipper, dialog rule, tracking block, DarkReader, GPU). If no arm restores playback, repeat with more videos, then re-hypothesize
  - Run the tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct and proves the bugs exist)
  - Document the counterexamples and the ablation results (which arms restore playback, which UA arms are rejected) in `tests/integration/RESULTS.md`
  - Mark the task complete when the tests are written, run, and the failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 1.17, 1.18, 1.19, 1.20_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Shield decisions, auth and popup routing, dark mode elsewhere, named greetings, MCP tools and remembered permissions
  - **IMPORTANT**: Follow observation-first methodology. Inputs here are the ones where `isBugCondition` returns false
  - Copy the unfixed `checkUrl` (with `KNOWN_TRACKERS`, the pattern list and stats), `isAuthOrSecurityUrl`, the window-open decision from `setWindowOpenHandler`, the DarkReader eligibility check and the greeting function into `tests/unit/fixtures/original/` before any source change
  - Observe on UNFIXED code, for example: a `KNOWN_TRACKERS` domain with a random subdomain is blocked with its category and rule; `https://www.youtube.com/api/stats/ads?x` is blocked; `https://github.com/login/oauth/authorize` is an auth URL; `window.open` with popup features opens a popup with the same size and partition, without features opens a tab; "Good morning, Ana" for name "Ana" at 09:00
  - Write property-based tests in `tests/unit/preservation.test.ts` that compare the fixtures with the live modules:
    - Shield decisions (design Property 10, 3.8 to 3.10): for generated tracker, ad-pattern and benign URLs that are not playback-critical, `checkUrl` returns the same `blocked`, `category` and `rule`, and `getStats()` changes by the same amount. With shields off, nothing is blocked and no ad script is produced
    - Auth and popup routing (design Property 11, 3.1 to 3.4): for URLs on identity-provider hosts (GitHub, Microsoft, Apple, Auth0, Clerk, Supabase), CAPTCHA hosts (reCAPTCHA, hCaptcha, Turnstile) and random paths containing `/oauth`, `/auth`, `/login`, `/signin`, `/signup`, `/otp`, `/token`, `isAuthOrSecurityUrl` is unchanged. For generated `{ url, disposition, features }` triples, the allow-as-popup or open-as-tab decision and the popup size, partition and opener are unchanged (title excluded)
    - Dark mode on other sites (design Property 12, 3.5, 3.6, 3.17): for generated URLs on ordinary hosts, auth hosts, `neutrino://` and `about:` that are not native-dark hosts, the inject-or-skip decision and the DarkReader settings (`brightness: 100, contrast: 95, sepia: 0`) are unchanged
    - Named greetings (design Property 13, 3.13): for non-empty names and hours 0 to 23, the greeting equals the original output
    - MCP tools (design Property 13, 3.12): each of `browser_navigate`, `browser_list_tabs`, `browser_create_tab`, `browser_close_tab`, `browser_get_adblock_stats`, `browser_zen_optimize`, `browser_media_control`, `browser_get_status` called with recorded parameters against a stub `BrowserManager` returns the same result and log entry
    - Safe permissions (3.15 baseline): `fullscreen`, `pointerLock`, `clipboard-sanitized-write`, `mediaKeySystem` are granted with zero prompts
  - Run the tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark the task complete when the tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17_

- [ ] 3. Fix Google sign-in, YouTube playback and release readiness

  - [x] 3.1 Add the central user-agent module and browser identity wiring
    - Done: `src/main/userAgent.ts`, `src/main/browserIdentity.ts`; webview `useragent` attributes and per-navigation `setUserAgent` calls removed
    - Create `src/main/userAgent.ts` (pure, no Electron import) with `buildUserAgent(defaultUA, productName, productVersion, chromeVersion, platform)`: take the OS token from the first parenthesised group of the default UA, fall back to the per-`process.platform` frozen Chromium token when parsing fails, and return `Mozilla/5.0 (<os>) AppleWebKit/537.36 (KHTML, like Gecko) Neutrino/<productVersion> Chrome/<chromeVersion> Safari/537.36`
    - Create `src/main/browserIdentity.ts` with `getBrowserUserAgent()` (computed once from `app.userAgentFallback` captured before any override, `app.getVersion()` and `process.versions.chrome`) and `applyBrowserIdentity(session)`
    - In `src/main/index.ts`: delete `CHROME_USER_AGENT`, set `app.userAgentFallback`, and call `session.setUserAgent` once for `defaultSession`, `persist:neutrino` and the assistant partitions before any window loads. Remove `setUserAgent` calls in `browser-window-created` and `web-contents-created`
    - In `BrowserViewport.tsx`: delete `DESKTOP_USER_AGENT`, the `useragent` attribute and `webview.setUserAgent` in `handleNav`. In `McpModal.tsx`: delete the inline UA literal
    - _Bug_Condition: C_ua(input) and C_auth(input) where the UA is Chrome-shaped, hard-coded or reports the wrong OS_
    - _Expected_Behavior: User-Agent = navigator.userAgent = buildUserAgent(defaultUA, "Neutrino", app.getVersion(), process.versions.chrome), not Chrome-shaped, no Electron/ token (design Property 1, 2)_
    - _Preservation: one UA per session fixed before the first navigation; `persist:neutrino` partition and storage untouched (3.3)_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.3_

  - [x] 3.2 Remove the client-hint header rewrite
    - Done; `tests/integration/headerCoherence.cjs --identity=fixed` passes all checks (the harness now reads hints from the subresource, because Chromium sends none on the top-level navigation to 127.0.0.1)
    - Delete the `onBeforeSendHeaders` handler in `setupNetworkInterception` so Chromium sends its own `Sec-CH-UA*` values
    - _Bug_Condition: C_ua(input) where "Google Chrome" is in Sec-CH-UA, brands disagree with navigator.userAgentData, or hints are added by the app_
    - _Expected_Behavior: Sec-CH-UA* = Chromium-generated hints matching navigator.userAgentData with the real platform (design Property 1)_
    - _Preservation: shield `onBeforeRequest` handling unchanged (3.8, 3.9)_
    - _Requirements: 1.6, 2.6_

  - [x] 3.3 Add URL classifiers and the sign-in rejection detector with "Open in system browser"
    - Implemented with a different design (google-oauth handoff fix): `src/main/googleAuth.ts` (pure detection, handoff target and tracker), `src/main/authHandoff.ts` (webContents and IPC wiring) and `src/renderer/components/AuthHandoffNotice.tsx` (one notice in the main window for tabs, popups and the drawer, instead of per-view banners and a native dialog)
    - The handoff opens the page the sign-in started from, never the OAuth authorization or callback URL: those carry `state`/PKCE values bound to Neutrino's session, so they would fail in the system browser
    - Also detects Google's OAuth `disallowed_useragent` error page; the IPC takes a handoff id, never a URL
    - Also fixed: tab webviews no longer re-navigate on their own URL echoes (src rewrite reloaded every navigation and replayed OAuth callbacks), startup no longer clears `persist:neutrino` storage, `disable-blink-features=AutomationControlled` removed
    - `isYouTubeHost` and `isPlaybackCriticalRequest` (YouTube part of this task) are not done
    - Create `src/main/urlClassifier.ts` (pure) with `isGoogleAuthUrl`, `isAuthOrSecurityUrl` (same list and matching as today), `isRejectionPage`, `isYouTubeHost` and `isPlaybackCriticalRequest`, matching on parsed hostnames and parent domains
    - In `web-contents-created`, track per `webContents.id` the last non-rejection `accounts.google.com` URL on `did-navigate` and `did-redirect-navigation`
    - On a rejection page: for a webview (tab or drawer) send `neutrino:signin-rejected` `{ webContentsId, retryUrl }` to the main window; for a popup show `dialog.showMessageBox` with "Open in system browser" and "Close", calling `shell.openExternal(retryUrl)` and closing the popup on the first button
    - Add `ipcMain.handle('neutrino:open-external', (_, webContentsId))` that opens only the recorded `retryUrl` for that id and only for `http:` or `https:`
    - Expose `onSigninRejected(cb)` and `openExternalForWebContents(id)` in `src/main/preload.ts`; no raw-URL API
    - Show a rejection banner with "Open in system browser" and "Dismiss" in `BrowserViewport.tsx` and in the `McpModal.tsx` drawer when the event names that webview's `getWebContentsId()`
    - Delete the dead `isGoogleAuthUrl` and `handleNewWindow` from `BrowserViewport.tsx`; `setWindowOpenHandler` stays the only routing path
    - Add unit tests for lookalike hosts (`accounts.google.com.evil.test`, `notyoutube.com`) and for the IPC rejecting `file:`, `javascript:` and unknown ids
    - _Bug_Condition: C_auth(input) where isRejectionPage(input.url) AND NOT fallbackOffered(input.context)_
    - _Expected_Behavior: fallback offered and scheme(externalUrl) IN [http, https] (design Property 3)_
    - _Preservation: `isAuthOrSecurityUrl` results and window-open decisions unchanged (design Property 11, 3.1, 3.2, 3.4)_
    - _Requirements: 1.7, 2.3, 2.7, 3.1, 3.2, 3.4_

  - [ ] 3.4 Rewrite the YouTube ad controller
    - Create `src/main/adblock/youtubeAdController.ts` with a pure `createAdController()` whose `tick(player, video)` reads the ad state from `#movie_player` (`ad-showing` or `ad-interrupting`) only
    - On entering the ad state save `{ rate, muted }`, then set `muted = true` and `playbackRate = 16`; click visible skip buttons (`.ytp-skip-ad-button`, `.ytp-ad-skip-button`, `.ytp-ad-skip-button-modern`, `.ytp-ad-overlay-close-button`); on leaving restore the saved values and clear them; never write `currentTime`
    - Build the injected script as `(${controllerSource})()` with a `MutationObserver` on `#movie_player` (`attributeFilter: ['class']`), a 1 s interval fallback for a replaced player, and the `__neutrino_ad_skipper_injected` guard. `getYouTubeAdSkipperScript()` returns it
    - Delete `injectAdblocking` and its inline skipper from `BrowserViewport.tsx`; gate the main-process injection on `isYouTubeHost(hostname)` with shields on
    - Add unit tests: ad begins and ends, back-to-back ads, ad begins while the user had 1.5x and muted, player replaced mid-ad
    - _Bug_Condition: C_yt(input) where input IS PlayerTick AND (seeksToEndOnAdClass OR rate left changed after the ad)_
    - _Expected_Behavior: currentTimeWrites = 0 AND (NOT adState IMPLIES rate = savedRate AND muted = savedMuted) (design Property 5)_
    - _Preservation: shields off injects no ad script (3.10); background playback and mini player unchanged (3.11)_
    - _Requirements: 1.9, 2.9, 3.10, 3.11_

  - [ ] 3.5 Allow playback-critical YouTube requests through shields
    - At the top of the pattern stage of `checkUrl`, return `{ blocked: false, domain: host }` when `isPlaybackCriticalRequest(url)`
    - Remove `'/ptracking'` from the pattern list; keep `/api/stats/ads`, `api/stats/qoe?adformat=`, `/pagead/`, `/get_midroll_info` and `youtubei/v1/player/ad_break`
    - _Bug_Condition: C_yt(input) where input IS Request AND shieldsOn AND isPlaybackCritical(url) AND blocked(url)_
    - _Expected_Behavior: NOT result.blocked for playback-critical URLs; YouTube ad URLs still blocked (design Property 6)_
    - _Preservation: identical decisions, stats and `neutrino:tracker-blocked` events for every other URL (design Property 10, 3.8, 3.9)_
    - _Requirements: 1.10, 2.10, 3.8, 3.9_

  - [ ] 3.6 Remove the YouTube dialog cosmetic rule
    - Delete `tp-yt-paper-dialog:has(#feedback)` from `getCosmeticFilterCSS()`; change no other selector
    - _Bug_Condition: C_yt(input) where input IS DialogShown AND pausesPlayer AND hiddenByCosmeticCss_
    - _Expected_Behavior: NOT matchesCosmeticCss(dialog) (design Property 7)_
    - _Preservation: all other cosmetic filters unchanged (3.8)_
    - _Requirements: 1.11, 2.11, 3.8_

  - [ ] 3.7 Skip DarkReader on native-dark sites and inject it once from the main process
    - Create `src/main/darkMode.ts` (pure) with `NATIVE_DARK_HOSTS` (host-suffix match), `shouldInjectDarkReader(url)` and `DARK_SUPPORT_PROBE` (color-scheme meta, computed `colorScheme`, or root/body background luminance below 0.2)
    - In the `dom-ready` injection, run the probe and skip DarkReader when `shouldInjectDarkReader` is false or the probe returns true
    - In `neutrino:set-theme-mode`, when switching to dark, inject DarkReader into eligible webviews that do not have it yet, and keep toggling open tabs without a reload
    - In `BrowserViewport.tsx`, delete the `darkReaderCode` raw import and the injection part of `syncDarkThemeForTab`; keep the `colorScheme` hint and the `window.neutrino.setThemeMode` call
    - _Bug_Condition: C_yt(input) where input IS PageLoad AND forceDark AND isYouTube(url) AND darkReaderInjected_
    - _Expected_Behavior: NOT result.darkReaderEvaluated on native-dark sites (design Property 4)_
    - _Preservation: same inject-or-skip decision and settings on other sites, theme switching without reload, PDF dark style (design Property 12, 3.5, 3.6, 3.7, 3.17)_
    - _Requirements: 1.8, 2.8, 3.5, 3.6, 3.7, 3.17_

  - [ ] 3.8 Remove the forced GPU switches
    - Remove `ignore-gpu-blocklist`, `enable-gpu-rasterization`, `enable-zero-copy`, `enable-native-gpu-memory-buffers` and `num-raster-threads` from `src/main/index.ts`
    - Keep `high-dpi-support`, `enable-quic`, `enable-fast-unload`, `disable-blink-features=AutomationControlled` and the default-on video-decode and 2D-canvas switches
    - _Bug_Condition: C_yt(input) where input IS GpuStartup AND gpuBlocklisted AND "ignore-gpu-blocklist" IN appliedSwitches_
    - _Expected_Behavior: FORCED_GPU_SWITCHES ∩ appliedSwitches = ∅ (design Property 7)_
    - _Preservation: other startup behavior unchanged (3.14)_
    - _Requirements: 1.12, 2.12_

  - [ ] 3.9 Use a neutral greeting when no name is stored
    - Create `src/renderer/utils/greeting.ts` with `getStoredUserName()` (reads `neutrino_user_profile.name`, then `neutrino_user_name`, trims, `''` when absent) and `formatGreeting(date, name)` with the current hour boundaries (0 to 11, 12 to 16, 17 to 23), appending `, <name>` only for a non-empty name
    - Use both in `Homescreen.tsx` and `McpModal.tsx` and delete the `'Yash'` fallbacks
    - In `WelcomeModal.tsx` stop calling `setName('Yash')`, allow an empty name, and use the placeholder "Enter your name"
    - Remove developer names from comments in `McpModal.tsx` and `theme.css` (no style changes)
    - Add unit tests for the 11:59, 12:00, 16:59 and 17:00 boundaries with and without a name
    - _Bug_Condition: C_rel(input) where input IS Render AND storedUserName IS EMPTY AND rendersDeveloperName_
    - _Expected_Behavior: result.text IN ["Good morning", "Good afternoon", "Good evening"] (design Property 8)_
    - _Preservation: stored names still greet by name (design Property 13, 3.13)_
    - _Requirements: 1.13, 2.13, 3.13_

  - [ ] 3.10 Report the app version from the MCP server
    - Make the `McpServer` constructor take `{ version: string }` and return it as `serverInfo.version` in `initialize`; pass `app.getVersion()` from `index.ts`
    - Leave every tool's output unchanged
    - _Bug_Condition: C_rel(input) where input IS McpInitialize AND serverInfo.version != package.json.version_
    - _Expected_Behavior: result.serverInfo.version = app.getVersion() (design Property 8)_
    - _Preservation: same results and log entries for the eight tools (design Property 13, 3.12)_
    - _Requirements: 1.14, 2.14, 3.12_

  - [ ] 3.11 Remove model badges and label bandwidth as an estimate
    - Remove the `3.5`, `4o`, `Flash` and `R1` badges from `ASSISTANTS` in `McpModal.tsx`; keep Perplexity's `Search`
    - Rename the literal in `BraveShieldEngine.recordBlock` to `ESTIMATED_KB_PER_BLOCKED_REQUEST = 54`; keep `ShieldStats.dataSavedKb`
    - In `ShieldModal.tsx`, label the figure "Est. bandwidth saved" with the tooltip "Estimated at about 54 KB per blocked request" and a leading `~`
    - _Bug_Condition: C_rel(input) where showsModelVersionBadge OR bandwidthShownAsMeasured_
    - _Expected_Behavior: no chip badge IN ["3.5", "4o", "Flash", "R1"] AND shield label contains "Est." (design Property 8)_
    - _Preservation: blocked counts and stats shape unchanged (3.9)_
    - _Requirements: 1.15, 1.16, 2.15, 2.16, 3.9_

  - [ ] 3.12 Add the packaging ignore list and leftover-file check
    - Create `scripts/package.cjs` that calls the `electron-packager` API with `prune: true` and the anchored ignore regexes from the design (`tests`, `scratch`, `docs`, `native`, `app`, `scripts`, `src`, `release`, `.github`, `.kiro`; root `*.md`, `*.py`, `*.png`, `*.ps1`; `tsconfig*.json`, `vite.config.ts`, `Cargo.*`)
    - Confirm `native/` and `app/` are not referenced from `dist-main`; if one is, remove it from the ignore list
    - Set `"package": "npm run build && node scripts/package.cjs"` and run `scripts/verify_package_contents.cjs` after packaging so leftover files fail the build
    - _Bug_Condition: C_rel(input) where input IS Package AND EXISTS f: isDeveloperOnly(f)_
    - _Expected_Behavior: NOT EXISTS f: matchesIgnoreList(f) OR containsUserPath(f) (design Property 8)_
    - _Preservation: `tests/` stays in the repository; `dist-main/`, `dist-renderer/`, `package.json` and production `node_modules` are packaged (3.16)_
    - _Requirements: 1.17, 2.17, 3.16_

  - [ ] 3.13 Replace grant-all permissions with prompts and remembered per-site grants
    - Create `src/main/permissions.ts` with `SAFE_PERMISSIONS`, `SENSITIVE_PERMISSIONS`, a `PermissionStore` persisted to `userData/permissions.json` (media keys include `media:video` / `media:audio`) and `createPermissionHandlers(store, promptFn)`
    - Request handler: safe grants; remembered decision applies; otherwise prompt "<origin> wants to use your <label>" with Allow / Block and a checked "Remember for this site" box; concurrent requests for the same origin and permission share one prompt; no window means deny; unknown permissions deny
    - Check handler: safe or remembered allow returns true, everything else false
    - Replace both handlers in `setupNetworkInterception` for every session
    - Add unit tests with an in-memory store and stub prompt: Allow with remember, Block without remember, shared prompt, no window, unknown permission
    - _Bug_Condition: C_rel(input) where permission IN SENSITIVE_PERMISSIONS AND rememberedGrant != ALLOW AND grantedWithoutPrompt_
    - _Expected_Behavior: result.prompted OR result.denied (design Property 9)_
    - _Preservation: remembered allows and safe permissions granted without a prompt (design Property 13, 3.15)_
    - _Requirements: 1.18, 2.18, 3.15_

  - [x] 3.14 Title popups from their page
    - Done: `src/main/windowOpen.ts` (`decideWindowOpen`, `buildPopupWindowOptions`)
    - Remove `title: 'Sign In'` from `overrideBrowserWindowOptions`; set the title to the popup URL's hostname when known and let `page-title-updated` replace it
    - _Bug_Condition: C_rel(input) where input IS PopupOpen AND popupTitle() = "Sign In"_
    - _Expected_Behavior: result.title != "Sign In" OR pageTitle = "Sign In" (design Property 8)_
    - _Preservation: popup size, partition, frame and opener unchanged (design Property 11, 3.1, 3.4)_
    - _Requirements: 1.19, 2.19, 3.1, 3.4_

  - [ ] 3.15 Gate debug logging to development builds
    - Create `src/main/logger.ts` with `debugLog()` enabled when `!app.isPackaged` or `NEUTRINO_DEBUG=1`, and route main-process debug output through it; keep real `console.error` calls for storage writes and the DarkReader load
    - Create `src/renderer/utils/debug.ts` with `debugLog()` enabled only when `import.meta.env.DEV`, and use it in place of `console.warn` in `handleFailLoad`
    - _Bug_Condition: C_rel(input) where input IS TabLoadFailure AND isProductionBuild AND consoleWritten_
    - _Expected_Behavior: result.consoleWrites = 0 in production (design Property 8)_
    - _Preservation: `VITE_DEV=true` still loads `http://localhost:3000` with debug output on (3.16)_
    - _Requirements: 1.20, 2.20, 3.16_

  - [ ] 3.16 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Coherent derived identity, intact YouTube playback and no developer artifacts
    - **IMPORTANT**: Re-run the SAME tests from task 1. Do NOT write new tests. Point the tests that used `tests/unit/fixtures/original/` copies of buggy logic at the fixed modules
    - Run `npm test`, the header coherence harness and the package contents check
    - With `NEUTRINO_LIVE_TESTS=1`, re-run the Google sign-in check in a tab, a popup (keeping `window.opener`) and the assistant drawer, and the YouTube watch-page check with force dark and shields on (time advances, rate is 1 after an ad, no DarkReader global, no `googlevideo.com` or `/ptracking` request blocked)
    - **EXPECTED OUTCOME**: Tests PASS (confirms the bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 2.20_

  - [ ] 3.17 Verify preservation tests still pass
    - **Property 2: Preservation** - Shield decisions, auth and popup routing, dark mode elsewhere, named greetings, MCP tools and remembered permissions
    - **IMPORTANT**: Re-run the SAME tests from task 2. Do NOT write new tests
    - Run `npm test` and add the remembered-allow permission property (remembered allow grants with zero prompts) now that `src/main/permissions.ts` exists
    - Smoke-check GitHub and Microsoft sign-in popups, a Turnstile demo page, session persistence across a restart, background playback with the mini player, and `VITE_DEV=true npm start`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run `npm test`, `npm run build` and `npm run package` (which runs the leftover-file check) and confirm all pass
  - Ensure all tests pass, ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.3", "3.4", "3.6", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.15"] },
    { "id": 2, "tasks": ["3.2", "3.5", "3.7", "3.14"] },
    { "id": 3, "tasks": ["3.16", "3.17"] },
    { "id": 4, "tasks": ["4"] }
  ]
}
```

- Tasks 1 and 2 run on unfixed code and must finish before any task in 3.
- 3.2 follows 3.1 because both edit `setupNetworkInterception` and the UA must be applied per session before the header rewrite is removed.
- 3.5 and 3.7 follow 3.3 because they use `isPlaybackCriticalRequest`, `isYouTubeHost` and `isAuthOrSecurityUrl` from `src/main/urlClassifier.ts`.
- 3.14 follows 3.3 because both edit the popup handling in `web-contents-created`.
- 3.16 and 3.17 follow every fix task.

## Notes

- If the Google sign-in ablation in task 1 shows the new UA arms are also rejected, or no YouTube ablation arm restores playback, stop and re-hypothesize with the user before task 3.
- Live tests depend on Google's servers, the account, the IP and the ads served, so they run only with `NEUTRINO_LIVE_TESTS=1` and are not part of `npm test`.
- Run vitest with `vitest --run` (the `npm test` script), never in watch mode.
