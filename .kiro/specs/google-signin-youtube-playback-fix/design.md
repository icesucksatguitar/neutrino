# Google Sign-in, YouTube Playback and Release Readiness Bugfix Design

## Overview

This design covers the three problem areas in bugfix.md.

1. **Google sign-in.** Every session, webview and popup gets a user-agent that is byte-for-byte shaped like stock desktop Chrome (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36`). `onBeforeSendHeaders` also rewrites `Sec-CH-UA*` on every request to claim `"Google Chrome"` and `"Windows"`. The string is copied in three places: `src/main/index.ts` (`CHROME_USER_AGENT`), `src/renderer/components/BrowserViewport.tsx` (`DESKTOP_USER_AGENT`) and an inline literal in `src/renderer/components/McpModal.tsx`. The public measurements in [stablyai/orca#11518](https://github.com/stablyai/orca/issues/11518) report that a Chrome-shaped UA from embedded Chromium was rejected 12 of 12 times, while a UA carrying any extra product token was rejected 0 of 12 times, and that forged client hints did not change the result. The fix builds one user-agent in one main-process module from the real Chromium version and the real OS, adds a `Neutrino/<version>` product token, applies it once per session, and stops rewriting request headers. A rejection detector offers "Open in system browser" when Google refuses anyway.
2. **YouTube playback.** Five things the app does to YouTube can each stall or break playback. The fix stops injecting DarkReader into sites with their own dark theme, rewrites the ad skipper so it never seeks the real video and always restores the playback rate, stops blocking playback-tracking endpoints, removes the cosmetic rule that hides player dialogs, and stops forcing GPU features past Chromium's blocklist. The ad skipper and DarkReader are also injected twice today (from the main process and from the renderer); the fix keeps only the main-process copy.
3. **Release readiness.** The fix removes the developer's name, stale version strings and model badges, labels the bandwidth figure as an estimate, excludes developer-only files from the package, replaces grant-everything permissions with prompts and remembered per-site grants, titles popups from their page, and gates debug logging to development builds.

Note on the version number: `package.json` pins `electron ^33.2.0`, which bundles Chromium 130, so `130.0.0.0` happens to match the running major version today. The rejection comes from the UA shape. The hard-coded number is still a defect because it drifts on the next Electron upgrade (1.4).

## Glossary

- **Bug_Condition (C)**: The set of inputs (requests, page loads, player states, permission requests, build actions, UI renders) for which the current code produces one of the defects in clauses 1.1 to 1.20.
- **Property (P)**: The required behavior for inputs in C, taken from clauses 2.1 to 2.20.
- **Preservation**: The behaviors in clauses 3.1 to 3.17 that must be identical before and after the fix for inputs outside C.
- **F / F'**: The original (unfixed) code and the fixed code.
- **Chrome-shaped UA**: A user-agent string that matches `^Mozilla/5\.0 \([^)]+\) AppleWebKit/537\.36 \(KHTML, like Gecko\) Chrome/[\d.]+ Safari/537\.36$` with no other product token.
- **Product token**: A `Name/version` token in the UA, such as `Neutrino/0.2.0`.
- **Browser UA**: The single user-agent string produced by `getBrowserUserAgent()` in the new `src/main/userAgent.ts`.
- **Client hints**: The `Sec-CH-UA`, `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform` and related headers, and the matching `navigator.userAgentData` values. Chromium generates both from the same internal metadata.
- **Rejection page**: Any `accounts.google.com` URL whose path contains `/signin/rejected` (for example `/v3/signin/rejected`).
- **Native-dark site**: A site that ships its own dark theme, either listed in `NATIVE_DARK_HOSTS` or detected at runtime by the dark-support probe.
- **Ad state**: The player element `#movie_player` (or `.html5-video-player`) carries the class `ad-showing` or `ad-interrupting`.
- **Playback-critical request**: A request YouTube's player needs to stream and keep playing: `*.googlevideo.com`, `youtube.com/youtubei/v1/player` (excluding `ad_break`), `youtube.com/ptracking`, and `youtube.com/api/stats/{playback,watchtime,delayplay,atr,qoe}` without an `adformat` parameter.
- **Sensitive permission**: An Electron permission that exposes devices, location, notifications, clipboard contents, screen contents or external app launch. Listed in `SENSITIVE_PERMISSIONS`.
- **`setupNetworkInterception`**: Function in `src/main/index.ts` that sets the UA, installs the shield `onBeforeRequest` handler, the header rewrite and the permission handlers.
- **`BraveShieldEngine`**: Class in `src/main/adblock/engine.ts` that decides blocking, produces cosmetic CSS and the YouTube ad-skipper script, and keeps shield stats.
- **`syncDarkThemeForTab`**: Renderer function in `BrowserViewport.tsx` that injects and toggles DarkReader for the active tab.

## Bug Details

### Bug Condition

The bug is a union of four groups of sub-conditions. Each sub-condition maps to one or more defect clauses.

- **C_auth** (1.1 to 1.7): any Google sign-in in a tab, popup or the assistant drawer, because every one of them carries the Chrome-shaped UA, plus any rejection the app has no way out of.
- **C_ua** (1.4 to 1.6): any request or page whose UA, client hints and JavaScript-visible identity are hard-coded, report the wrong OS, or disagree with each other.
- **C_yt** (1.8 to 1.12): YouTube page loads and player states touched by DarkReader, the ad skipper, the network rules, the cosmetic rules or the forced GPU switches.
- **C_rel** (1.13 to 1.20): user-visible developer values, the package contents, permission requests, popup titles and production console output.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type BrowserEvent, one of
         Request{url, headers, sessionUA, platform}
         PageLoad{url, context IN [tab, popup, drawer], forceDark, shieldsOn}
         PlayerTick{url, playerHasAdClass, video{rate, currentTime, duration}, rateBeforeAd}
         DialogShown{url, element, pausesPlayer}
         GpuStartup{gpuBlocklisted}
         Render{surface, storedUserName}
         McpInitialize{}
         PermissionRequest{origin, permission, rememberedGrant}
         PopupOpen{url, features}
         TabLoadFailure{isProductionBuild}
         Package{fileList}
  OUTPUT: boolean

  RETURN C_auth(input) OR C_ua(input) OR C_yt(input) OR C_rel(input)
END FUNCTION

FUNCTION C_auth(input)
  RETURN (input IS PageLoad
          AND host(input.url) IN GOOGLE_AUTH_HOSTS
          AND isChromeShaped(uaOf(input.context)))                        // 1.1, 1.2, 1.3
      OR (input IS PageLoad
          AND isRejectionPage(input.url)
          AND NOT fallbackOffered(input.context))                         // 1.7
END FUNCTION

FUNCTION C_ua(input)
  RETURN input IS Request
     AND ( versionOf(input.headers["User-Agent"]) != process.versions.chrome AND
           versionOf(...) is a source literal                             // 1.4
        OR osTokenOf(input.headers["User-Agent"]) != realOsToken(input.platform)
        OR input.headers["Sec-CH-UA-Platform"] != realPlatformHint(input.platform)   // 1.5
        OR "Google Chrome" IN brands(input.headers["Sec-CH-UA"])
        OR brands(input.headers["Sec-CH-UA"]) != navigator.userAgentData.brands
        OR clientHintsAddedByApp(input) )                                 // 1.6
END FUNCTION

FUNCTION C_yt(input)
  RETURN (input IS PageLoad AND input.forceDark AND isYouTube(input.url)
          AND darkReaderInjected(input))                                  // 1.8
      OR (input IS PlayerTick AND isYouTube(input.url)
          AND (seeksToEndOnAdClass(input)
               OR (NOT input.playerHasAdClass AND input.video.rate != input.rateBeforeAd
                   AND rateWasSetBySkipper)))                             // 1.9
      OR (input IS Request AND shieldsOn AND isPlaybackCritical(input.url)
          AND blocked(input.url))                                         // 1.10
      OR (input IS DialogShown AND isYouTube(input.url) AND input.pausesPlayer
          AND hiddenByCosmeticCss(input.element))                         // 1.11
      OR (input IS GpuStartup AND input.gpuBlocklisted
          AND "ignore-gpu-blocklist" IN appliedSwitches)                  // 1.12
END FUNCTION

FUNCTION C_rel(input)
  RETURN (input IS Render AND input.storedUserName IS EMPTY
          AND rendersDeveloperName(input.surface))                        // 1.13
      OR (input IS McpInitialize AND serverInfo.version != package.json.version)  // 1.14
      OR (input IS Render AND input.surface = assistantChips
          AND showsModelVersionBadge())                                   // 1.15
      OR (input IS Render AND input.surface = shieldPanel
          AND bandwidthShownAsMeasured())                                 // 1.16
      OR (input IS Package AND EXISTS f IN input.fileList: isDeveloperOnly(f))  // 1.17
      OR (input IS PermissionRequest AND input.permission IN SENSITIVE_PERMISSIONS
          AND input.rememberedGrant != ALLOW AND grantedWithoutPrompt())  // 1.18
      OR (input IS PopupOpen AND isPopup(input) AND popupTitle() = "Sign In")      // 1.19
      OR (input IS TabLoadFailure AND input.isProductionBuild
          AND consoleWritten())                                           // 1.20
END FUNCTION
```

### Examples

- **Google sign-in in a tab (1.1).** Open `https://accounts.google.com/`, enter any address, press Next. Expected: password, passkey or "Couldn't find your Google Account" page. Actual: `https://accounts.google.com/v3/signin/rejected` with "This browser or app may not be secure".
- **Google sign-in popup (1.2).** On `https://chatgpt.com/` choose "Continue with Google". The popup opens with `CHROME_USER_AGENT` (set in `browser-window-created` and `web-contents-created`) and lands on the same rejection page. Expected: the popup completes and `window.opener` receives the result.
- **Header mismatch (1.6).** A request from a tab on macOS carries `User-Agent: ... (Windows NT 10.0; Win64; x64) ... Chrome/130.0.0.0 ...`, `Sec-CH-UA: "Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"` and `Sec-CH-UA-Platform: "Windows"`, while `navigator.userAgentData.brands` in the page has no `"Google Chrome"` entry and `navigator.userAgentData.platform` is `"macOS"`. Expected: all four agree and report macOS.
- **Ad skipper on a stitched ad (1.9).** While `.ad-showing` is on the player, the skipper sets `video.currentTime = video.duration`. If YouTube serves the ad stitched into the same stream as the content, the duration is the content's duration, so the real video jumps to its end. Separately, after a normal ad the skipper never resets `video.playbackRate` from `16`. Expected: the content starts at its own position and at the rate the user had before the ad.
- **Hidden pause dialog (1.11).** The cosmetic rule `tp-yt-paper-dialog:has(#feedback)` matches YouTube's paper dialogs. When YouTube opens a dialog and pauses the player (for example "Video paused. Continue watching?" or an enforcement notice), the dialog is `display: none`, so the video sits paused with no visible reason. Expected: the dialog is visible.
- **Tracking request blocked (1.10).** `BraveShieldEngine.checkUrl("https://www.youtube.com/ptracking?ei=...")` returns `{ blocked: true, rule: "Pattern: ad-endpoint" }`. Expected: not blocked. `https://www.youtube.com/api/stats/ads?...` stays blocked.
- **Greeting (1.13).** With empty `localStorage`, the home screen renders "Good evening, Yash" and the MCP drawer renders the same. Expected: "Good evening".
- **Permission (1.18).** `navigator.mediaDevices.getUserMedia({ video: true })` on any site starts the camera with no prompt because `setPermissionRequestHandler` always calls `callback(true)`. Expected: a prompt, or denial by default.
- **Edge case, already-remembered grant (3.15).** A site the user allowed for the microphone last week asks again. Expected: granted with no prompt, same as today.
- **Edge case, non-YouTube site with own dark theme.** `github.com` with force dark on. Expected after the fix: DarkReader is not injected and GitHub's own dark theme (via `prefers-color-scheme: dark`) is used.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Non-Google identity providers (GitHub, Microsoft, Apple, Auth0, Clerk, Supabase) keep completing sign-in in tabs and popups with `window.opener` intact (3.1).
- reCAPTCHA, hCaptcha and Cloudflare Turnstile keep loading; `isAuthOrSecurityUrl` keeps exempting them from shields (3.2).
- Logins in `persist:neutrino` survive restarts; the partition name and its storage are not touched (3.3).
- `target="_blank"` links and `window.open` without popup features keep opening as Neutrino tabs in the active space (3.4).
- Sites without their own dark theme keep being darkened by DarkReader with the same settings (`brightness: 100, contrast: 95, sepia: 0`) (3.5); auth, security, `neutrino://` and `about:` pages stay unstyled (3.6); switching theme keeps updating chrome, `nativeTheme` and open tabs without a reload (3.7).
- On non-YouTube pages, shields keep blocking the same `KNOWN_TRACKERS` domains and URL patterns and injecting the same cosmetic CSS, minus the YouTube dialog rule (3.8). Every block keeps sending `neutrino:tracker-blocked` and updating counts (3.9). With shields off nothing is blocked and no ad-skipping script is injected (3.10).
- Background media keeps playing, the mini player keeps showing, and media tabs stay out of the Zen sleep pass (3.11).
- All eight existing MCP tools return the same results and are logged (3.12).
- A stored user name keeps appearing in both greetings (3.13).
- Tabs, spaces, shortcuts, zoom, command bar and theme customizer behave as today (3.14).
- Remembered permission grants keep being honored without asking (3.15).
- `VITE_DEV=true` keeps loading `http://localhost:3000`, and `tests/` stays in the repository (3.16).
- PDFs in dark mode keep the inverted PDF viewer style (3.17).

**Scope:**
All inputs that do NOT satisfy isBugCondition should be completely unaffected by this fix. This includes:
- Requests and page loads on non-YouTube sites with shields on or off, apart from the UA string and client-hint headers, which change for every request by design (the UA change is the fix for C_ua).
- Sign-in flows that do not touch Google auth hosts.
- Force-dark page loads on sites that have no native dark theme.
- Permission requests for non-sensitive permissions (`fullscreen`, `pointerLock`, `clipboard-sanitized-write`, `mediaKeySystem`) and requests already covered by a remembered grant.
- Popups whose behavior (size, partition, frame, opener) is unchanged apart from the title.
- Development runs (`VITE_DEV=true`, unpackaged), where debug logging stays on.

## Hypothesized Root Cause

### Google sign-in

1. **Chrome-shaped UA is the trigger (primary).** All three contexts receive the same Chrome-shaped string through `app.userAgentFallback`, `session.setUserAgent`, `contents.setUserAgent`, the webview `useragent` attribute and `webview.setUserAgent` in `handleNav`. orca#11518 isolates this variable: rows that differ only in the UA flip between "password page" and "rejected", and a UA with an extra product token before `Chrome/` (`<app-name>/0.0.0 Chrome/... Safari/537.36`) reached the password page. A plausible reading is that Google cross-checks a stock-Chrome claim against signals embedded Chromium cannot fake, while a UA that declares another product is treated as an honest Chromium-based browser. Google does not document this, so the design treats it as current observed behavior.
2. **Forged client hints are a secondary inconsistency.** `onBeforeSendHeaders` sets `"Google Chrome"` and `"Windows"` in `Sec-CH-UA*` on every request, including requests that would not carry them, while `navigator.userAgentData` keeps Chromium's real values. orca#11518 found forged hints did not change Google's verdict, but the mismatch is still a fingerprint inconsistency that other bot checks (including Turnstile) can score.
3. **Per-host UA switching is not the answer.** orca#11518 also argues against changing the UA by destination host, because redirects and subresources then carry mixed identities and Cloudflare treats a mid-session UA change as a risk signal. The design therefore uses one UA per session partition, fixed before the first navigation, with the same value for Google and non-Google hosts.
4. **No exit path.** Nothing watches for the rejection page, so when Google refuses there is no fallback.

### YouTube playback

Ranked by expected impact. The exploratory tests below confirm or refute each one with an ablation run.

1. **Ad skipper seeks and leaves the rate at 16x (most likely to break every video).** The skipper runs in two copies: `getYouTubeAdSkipperScript()` from the main process every 250 ms, and an inline copy in `BrowserViewport.injectAdblocking` driven by a `MutationObserver` on the whole document plus a 2 s interval. Whichever sets `window.__neutrino_ad_skipper_injected` first wins. Both copies query `.ad-showing` anywhere in the document instead of on the player, set `currentTime = duration`, set `playbackRate = 16`, and never restore either. With stitched ads, or when the class lingers for a tick after the content starts, the content itself is seeked to its end or plays at 16x. Seeking ads to their end is also a known ad-block signal.
2. **Hidden pause dialog.** `tp-yt-paper-dialog:has(#feedback)` hides YouTube paper dialogs that pause the player, so playback looks frozen.
3. **Blocked playback tracking.** `/ptracking` is in the pattern list. YouTube's player reports playback to `/ptracking` and `/api/stats/*`, and failed reports can lead to stalls or ad-block enforcement. `/api/stats/qoe` without `adformat` and `/api/stats/watchtime` are not blocked today, so only `/ptracking` and `/api/stats/ads` are in play; `/api/stats/ads` is an ad endpoint and stays blocked.
4. **DarkReader on YouTube.** The 362 KB engine is evaluated in the page, observes the full DOM and rewrites styles on YouTube's very mutation-heavy SPA, and is injected by both the main process (`dom-ready`) and the renderer (`syncDarkThemeForTab`), which can race and evaluate the library twice. This mainly costs CPU and frame time; it can cause stutter and slow seeks. YouTube already follows `prefers-color-scheme: dark`, which `nativeTheme.themeSource = 'dark'` provides, so DarkReader adds no value there.
5. **Forced GPU switches.** `ignore-gpu-blocklist`, `enable-zero-copy`, `enable-native-gpu-memory-buffers` and `enable-gpu-rasterization` override Chromium's per-driver safeguards. On affected drivers this gives black, green or frozen video. This is machine-specific and cannot explain a failure on every machine.

### Release readiness

1. **Literal fallbacks.** `'Yash'` is the fallback in `Homescreen.tsx`, `McpModal.getGreeting` and `WelcomeModal` (auto-fill and placeholder); comments in `McpModal.tsx` and `theme.css` also name the developer.
2. **Hard-coded metadata.** `serverInfo.version: '0.1.0'` in `src/main/mcp/server.ts`; `badge` values in the `ASSISTANTS` list in `McpModal.tsx`; `dataSavedKb += 54` in `BraveShieldEngine.recordBlock` shown as "Bandwidth Saved".
3. **No packaging ignore list.** `npm run package` runs `electron-packager . Neutrino ... --prune=true` with no `--ignore`, so the whole project directory except pruned dev dependencies is copied, including `tests/` (scripts with `C:/Users/simpl/...` paths), `scratch/`, root `*.md`, `*.png`, `*.py`, `src/`, `native/`, `.kiro/` and `.github/`.
4. **Grant-all permission handlers.** `setPermissionCheckHandler(() => true)` and `setPermissionRequestHandler(... callback(true))` on every session.
5. **Fixed popup title.** `overrideBrowserWindowOptions.title: 'Sign In'` for every popup.
6. **Ungated logging.** `console.warn('Webview failed to load:', ...)` in `BrowserViewport.handleFailLoad`.

## Correctness Properties

Property 1: Bug Condition - Coherent, derived user-agent identity

_For any_ request or page in any session, webview, popup or drawer on any supported platform, the fixed code SHALL send a User-Agent header equal to `navigator.userAgent` and equal to `buildUserAgent(defaultUA, "Neutrino", app.getVersion(), process.versions.chrome)`. That string SHALL contain `Chrome/<process.versions.chrome>`, the real OS token, exactly one extra product token `Neutrino/<app version>` placed before `Chrome/`, and no `Electron/` token. The `Sec-CH-UA*` headers SHALL be the ones Chromium generates, SHALL match `navigator.userAgentData`, SHALL report the real platform, and SHALL NOT contain `"Google Chrome"`.

**Validates: Requirements 2.4, 2.5, 2.6**

Property 2: Bug Condition - Google sign-in reaches the challenge step

_For any_ Google sign-in started in a tab, a popup or the assistant drawer, after submitting an account identifier the fixed code SHALL land on a non-rejection Google URL (password, passkey, challenge, CAPTCHA or account-not-found), and a popup flow SHALL keep `window.opener` and return to the opening site.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 3: Bug Condition - Rejection fallback

_For any_ navigation of a tab, popup or drawer webview to a rejection page, the fixed code SHALL offer an "Open in system browser" action that opens the last pre-rejection Google sign-in URL with `shell.openExternal`, and SHALL only open `http:` or `https:` URLs.

**Validates: Requirements 2.3, 2.7**

Property 4: Bug Condition - No DarkReader on native-dark sites

_For any_ URL whose host is in `NATIVE_DARK_HOSTS` (YouTube included) or whose page passes the dark-support probe, with force dark on, the fixed code SHALL NOT evaluate the DarkReader library in the page, and SHALL leave the page on its own `prefers-color-scheme: dark` theme.

**Validates: Requirements 2.8**

Property 5: Bug Condition - Ad skipper never alters the real video

_For any_ sequence of player ticks on YouTube, the fixed ad controller SHALL never write `video.currentTime`, SHALL change `playbackRate` or `muted` only while the player element has the ad state, and on the first tick after the ad state clears SHALL restore `playbackRate` and `muted` to the values saved when the ad state began.

**Validates: Requirements 2.9**

Property 6: Bug Condition - Playback-critical YouTube requests pass

_For any_ URL that is a playback-critical request, `BraveShieldEngine.checkUrl` SHALL return `blocked: false` with shields on, and _for any_ URL matching the existing YouTube ad patterns (`/api/stats/ads`, `/pagead/`, `/get_midroll_info`, `youtubei/v1/player/ad_break`, `api/stats/qoe?adformat=`) it SHALL still return `blocked: true`.

**Validates: Requirements 2.10**

Property 7: Bug Condition - Player dialogs and GPU safeguards

_For any_ YouTube dialog element, the cosmetic CSS from the fixed engine SHALL NOT match it, and the fixed startup SHALL NOT append `ignore-gpu-blocklist`, `enable-zero-copy`, `enable-native-gpu-memory-buffers` or `enable-gpu-rasterization`.

**Validates: Requirements 2.11, 2.12**

Property 8: Bug Condition - No developer artifacts reach the user

_For any_ empty or whitespace stored name and any hour of the day, the fixed greeting SHALL be exactly one of "Good morning", "Good afternoon" or "Good evening" with no name. The MCP `initialize` result SHALL report `app.getVersion()`. Assistant chips SHALL show no model-version badge. The shield panel SHALL label bandwidth as an estimate. The packaged app SHALL contain no file matching the developer-only ignore list. Popups SHALL take their title from their page. A failed tab load in a packaged build SHALL write nothing to the console.

**Validates: Requirements 2.13, 2.14, 2.15, 2.16, 2.17, 2.19, 2.20**

Property 9: Bug Condition - Sensitive permissions are not silently granted

_For any_ origin and any permission in `SENSITIVE_PERMISSIONS` with no remembered decision, the fixed request handler SHALL ask the user before granting, SHALL deny when no prompt can be shown, and the check handler SHALL return `false`. Unknown permissions SHALL be denied.

**Validates: Requirements 2.18**

Property 10: Preservation - Shield decisions and stats outside YouTube playback

_For any_ URL that is not a playback-critical request, the fixed `BraveShieldEngine.checkUrl` SHALL return the same `blocked`, `category` and `rule` as the original, SHALL update `getStats()` counts identically, and the main process SHALL keep sending `neutrino:tracker-blocked` for every block. With shields off, both versions SHALL block nothing and inject no ad script.

**Validates: Requirements 3.8, 3.9, 3.10**

Property 11: Preservation - Auth, popup and tab routing

_For any_ URL and window-open request, the fixed `isAuthOrSecurityUrl` SHALL return the same result as the original, and the fixed window-open handler SHALL make the same allow-as-popup or open-as-tab decision with the same size, partition and opener behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

Property 12: Preservation - Dark mode on other sites and pages

_For any_ URL that is not on a native-dark site, the fixed code SHALL make the same DarkReader inject-or-skip decision as the original (inject on ordinary sites, skip on auth, security, `neutrino://` and `about:` pages) with the same DarkReader settings, SHALL toggle open tabs on theme change without reloading, and SHALL keep the PDF dark style.

**Validates: Requirements 3.5, 3.6, 3.7, 3.17**

Property 13: Preservation - Named greetings, MCP tools, permissions and dev mode

_For any_ non-empty stored name the fixed greeting SHALL equal the original greeting. _For any_ existing MCP tool call the fixed server SHALL return the same result and log entry. _For any_ origin with a remembered allow, the fixed handlers SHALL grant without prompting. Running with `VITE_DEV=true` SHALL load `http://localhost:3000`.

**Validates: Requirements 3.11, 3.12, 3.13, 3.14, 3.15, 3.16**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/main/userAgent.ts` (new, pure, no Electron import)

**Function**: `buildUserAgent(defaultUA, productName, productVersion, chromeVersion, platform)`

**Specific Changes**:
1. **Derive the OS token from Chromium.** Read the first parenthesised group of Electron's default UA (captured from `app.userAgentFallback` before anything overrides it). If parsing fails, fall back to a per-`process.platform` token (`Windows NT 10.0; Win64; x64`, `Macintosh; Intel Mac OS X 10_15_7`, `X11; Linux x86_64`). These are the frozen tokens Chromium itself uses after UA reduction, so they are not developer values.
2. **Build one shape.** Return `Mozilla/5.0 (<os>) AppleWebKit/537.36 (KHTML, like Gecko) Neutrino/<productVersion> Chrome/<chromeVersion> Safari/537.36`. This matches the measured passing shape in orca#11518 (`<app-name>/<ver> Chrome/<full> Safari/537.36`), drops the `Electron/` token that some sites treat as a non-browser, and uses the full Chromium version as Electron's default does, so `navigator.userAgentData.getHighEntropyValues(['fullVersionList'])` agrees with it.
3. **Electron wrapper.** `src/main/browserIdentity.ts` exports `getBrowserUserAgent()`, computed once at startup from `app.userAgentFallback`, `app.getVersion()` and `process.versions.chrome`, and `applyBrowserIdentity(session)`.

**File**: `src/main/index.ts`

**Function**: module top level, `setupNetworkInterception`, `app.whenReady` handlers

**Specific Changes**:
1. **One UA path.** Delete `CHROME_USER_AGENT`. Set `app.userAgentFallback = getBrowserUserAgent()` and call `session.setUserAgent(getBrowserUserAgent())` once for `defaultSession`, `persist:neutrino` and the assistant partitions before any window loads. Remove `win.webContents.setUserAgent` in `browser-window-created` and `contents.setUserAgent` in `web-contents-created`; new contents inherit the session UA, so identity is fixed before the first navigation and never changes mid-session.
2. **Stop rewriting headers.** Remove the `onBeforeSendHeaders` handler. Chromium then sends the UA from the session and its own `Sec-CH-UA*` values, which match `navigator.userAgentData` and report the real platform and brands.
3. **Rejection detector.** In `web-contents-created`, listen to `did-navigate` and `did-redirect-navigation`. Keep, per `webContents.id`, the last `accounts.google.com` URL that is not a rejection page. On a rejection page:
   - For a `webview` (tab or drawer), send `neutrino:signin-rejected` with `{ webContentsId, retryUrl }` to the main window.
   - For a popup `BrowserWindow`, show `dialog.showMessageBox(popup, { message: "Google blocked sign-in in this window", buttons: ["Open in system browser", "Close"] })`; on the first button call `shell.openExternal(retryUrl)` and close the popup.
   - Add `ipcMain.handle('neutrino:open-external', (_, webContentsId))`, which opens only the `retryUrl` recorded for that id and only if its protocol is `http:` or `https:`. The renderer never passes a raw URL.
4. **GPU switches.** Remove `ignore-gpu-blocklist`, `enable-gpu-rasterization`, `enable-zero-copy` and `enable-native-gpu-memory-buffers`. Keep `high-dpi-support`, `enable-quic`, `enable-fast-unload`, `disable-blink-features=AutomationControlled` and the default-on video-decode and 2D-canvas switches, which do not bypass the blocklist. Remove `num-raster-threads` so Chromium sizes the raster pool itself.
5. **Single owner for page injection.** Keep the `dom-ready` injection here (cosmetic CSS, ad controller, DarkReader) and delete the renderer copies. Gate the ad controller on `isYouTubeHost(hostname)` instead of `url.includes('youtube.com')`. Gate DarkReader on `shouldInjectDarkReader(url)` and the runtime probe (below). In `neutrino:set-theme-mode`, when switching to dark, inject the library into eligible webviews that do not have it yet, so the renderer no longer needs its own copy (3.7).
6. **Permissions.** Replace both handlers with `createPermissionHandlers(store, promptFn)` from `src/main/permissions.ts`.
7. **Popup title.** Remove `title: 'Sign In'`. Set `title` to the popup URL's hostname when known and let Electron's default `page-title-updated` behavior replace it with the page title.
8. **Logging.** Route debug output through `debugLog()` from `src/main/logger.ts`, enabled when `!app.isPackaged` or `NEUTRINO_DEBUG=1`. Real errors (`console.error` for storage writes and the DarkReader load) stay.

**File**: `src/main/urlClassifier.ts` (new, pure)

**Specific Changes**:
1. Move `isGoogleAuthUrl`, `isAuthOrSecurityUrl`, `isRejectionPage`, `isYouTubeHost` and `isPlaybackCriticalRequest` here. `isGoogleAuthUrl` and `isYouTubeHost` compare the parsed hostname and its parent domains instead of substrings anywhere in the URL. `isAuthOrSecurityUrl` keeps its current list and matching so its results are identical (Property 11).

**File**: `src/main/darkMode.ts` (new, pure)

**Specific Changes**:
1. `NATIVE_DARK_HOSTS`: `youtube.com`, `github.com`, `x.com`, `twitter.com`, `reddit.com`, `discord.com`, `chatgpt.com`, `claude.ai`, `gemini.google.com`, `perplexity.ai`, `chat.deepseek.com`, `wikipedia.org`, `stackoverflow.com`, matched by host suffix.
2. `shouldInjectDarkReader(url)`: false for `neutrino://`, `about:`, `isAuthOrSecurityUrl(url)` and native-dark hosts; true otherwise.
3. `DARK_SUPPORT_PROBE`: a page script that returns true when `<meta name="color-scheme">` lists `dark`, or `getComputedStyle(document.documentElement).colorScheme` includes `dark`, or the computed body or root background has relative luminance below 0.2. The main process runs it before evaluating DarkReader and skips injection when it returns true. This generalises beyond the fixed list.

**File**: `src/main/adblock/engine.ts`

**Functions**: `checkUrl`, `getCosmeticFilterCSS`, `getYouTubeAdSkipperScript`, `recordBlock`

**Specific Changes**:
1. **Allow playback-critical requests.** At the top of the pattern stage, return `{ blocked: false, domain: host }` when `isPlaybackCriticalRequest(url)`. Remove `'/ptracking'` from the pattern list. Keep `/api/stats/ads`, `api/stats/qoe?adformat=`, `/pagead/`, `/get_midroll_info` and `youtubei/v1/player/ad_break`.
2. **Remove the dialog rule.** Delete `tp-yt-paper-dialog:has(#feedback)` from the cosmetic CSS. No other selector changes.
3. **New ad controller.** Move the logic to `src/main/adblock/youtubeAdController.ts` as a pure `createAdController()` with `tick(player, video)` that:
   - Treats the ad state as `player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')` on `#movie_player`, not any element in the document.
   - On entering the ad state, saves `{ rate: video.playbackRate, muted: video.muted }`, then sets `muted = true` and `playbackRate = 16` (Chromium's maximum).
   - Clicks visible skip buttons (`.ytp-skip-ad-button`, `.ytp-ad-skip-button`, `.ytp-ad-skip-button-modern`, `.ytp-ad-overlay-close-button`).
   - On leaving the ad state, restores the saved rate and mute state and clears the saved state.
   - Never writes `currentTime`.
   The injected script is `(${controllerSource})()` built from the function source, attaches a `MutationObserver` to `#movie_player` with `attributeFilter: ['class']`, plus a 1 s interval fallback for when the player element is replaced, and keeps the `__neutrino_ad_skipper_injected` guard.
4. **Bandwidth estimate.** Rename the literal to `ESTIMATED_KB_PER_BLOCKED_REQUEST = 54`. `ShieldStats.dataSavedKb` keeps its name and meaning so callers and types are unchanged.

**File**: `src/main/permissions.ts` (new)

**Specific Changes**:
1. `SAFE_PERMISSIONS = ['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'mediaKeySystem']`, granted without asking (today's behavior for these).
2. `SENSITIVE_PERMISSIONS = ['media', 'geolocation', 'notifications', 'clipboard-read', 'display-capture', 'midi', 'midiSysex', 'idle-detection', 'window-management', 'openExternal', 'storage-access', 'top-level-storage-access', 'keyboardLock']`. Anything in neither list is denied.
3. `PermissionStore` persists `{ [origin]: { [permission]: 'allow' | 'deny' } }` to `app.getPath('userData')/permissions.json`. For `media`, the key includes the media type (`media:video`, `media:audio`) from `details.mediaTypes`.
4. Request handler: safe → grant; remembered → apply; otherwise show `dialog.showMessageBox(owningWindow, { message: "<origin> wants to use your <label>", buttons: ["Allow", "Block"], checkboxLabel: "Remember for this site", checkboxChecked: true })`, save if checked, and call back. Concurrent requests for the same origin and permission share one prompt. If no window is available, deny.
5. Check handler: safe → true; remembered allow → true; otherwise false.

**File**: `src/main/mcp/server.ts`

**Specific Changes**:
1. Constructor takes `{ version: string }`; `index.ts` passes `app.getVersion()`. `initialize` returns `serverInfo.version` from it. `browser_get_status` output is unchanged (it has no version field today), so Property 13 holds.

**File**: `src/renderer/components/BrowserViewport.tsx`

**Specific Changes**:
1. Delete `DESKTOP_USER_AGENT`, the `useragent` attribute on the `<webview>` and `webview.setUserAgent` in `handleNav`.
2. Delete `isGoogleAuthUrl` and `handleNewWindow`. The webview `new-window` event no longer exists in Electron 33, so this code never runs; `setWindowOpenHandler` in the main process is the only routing path and is unchanged.
3. Delete `injectAdblocking`, the `darkReaderCode` raw import and the injection part of `syncDarkThemeForTab`. Keep the `colorScheme` hint and `window.neutrino.setThemeMode` call so the main process owns injection and toggling.
4. Show a rejection banner over the tab when `neutrino:signin-rejected` names this webview's `getWebContentsId()`, with "Open in system browser" (calls `window.neutrino.openExternalForWebContents(id)`) and "Dismiss".
5. Replace `console.warn` in `handleFailLoad` with `debugLog` from `src/renderer/utils/debug.ts`, enabled only when `import.meta.env.DEV`.

**File**: `src/main/preload.ts`

**Specific Changes**:
1. Expose `onSigninRejected(cb)` and `openExternalForWebContents(id)`. No raw-URL API is exposed.

**File**: `src/renderer/components/McpModal.tsx`

**Specific Changes**:
1. Remove the inline UA literal from the assistant webview.
2. Remove the `badge` values `3.5`, `4o`, `Flash` and `R1`. Keep Perplexity's `Search`, which describes the product category and does not go stale.
3. Use the shared greeting helper and the same rejection banner as tabs.
4. Remove developer names from comments.

**File**: `src/renderer/utils/greeting.ts` (new)

**Specific Changes**:
1. `getStoredUserName()`: reads `neutrino_user_profile.name`, then `neutrino_user_name`, trims, returns `''` when absent.
2. `formatGreeting(date, name)`: returns `Good morning|afternoon|evening` with the same hour boundaries as today (0 to 11, 12 to 16, 17 to 23) and appends `, <name>` only when the trimmed name is non-empty.
3. `Homescreen.tsx` and `McpModal.tsx` use both functions; the `'Yash'` fallbacks are deleted.

**File**: `src/renderer/components/WelcomeModal.tsx`

**Specific Changes**:
1. Stop calling `setName('Yash')`; allow continuing with an empty name. Placeholder becomes "Enter your name".

**File**: `src/renderer/components/ShieldModal.tsx`

**Specific Changes**:
1. Label "Est. bandwidth saved" with a `title` tooltip "Estimated at about 54 KB per blocked request". Show the value with a leading `~`.

**File**: `src/renderer/styles/theme.css`

**Specific Changes**:
1. Replace the comment "Personalized Time-Based Greeting for Yash" with a neutral comment. No style changes.

**File**: `scripts/package.cjs` (new) and `package.json`

**Specific Changes**:
1. Call the existing `electron-packager` dev dependency through its API with `prune: true` and an `ignore` list of anchored regexes: `^/(tests|scratch|docs|native|app|scripts|src|release|\.github|\.kiro)(/|$)`, `^/[^/]+\.(md|py|png|ps1)$`, `^/(tsconfig[^/]*\.json|vite\.config\.ts|Cargo\.(toml|lock))$`. `dist-main/`, `dist-renderer/`, `package.json` and production `node_modules` remain.
2. `"package": "npm run build && node scripts/package.cjs"`.
3. `scripts/verify_package_contents.cjs` walks `release/Neutrino-*/resources/app` and exits non-zero if any path matches the ignore list or contains `C:/Users/` or `C:\\Users\\`. The package script runs it after packaging.
4. Confirm during implementation that `native/` and `app/` are not loaded at runtime (no `require` or path reference from `dist-main`). If one is, remove it from the ignore list.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

The repository has no unit-test runner today (`tests/` holds ad-hoc Electron and Python scripts). Add `vitest` and `fast-check` as dev dependencies and a `"test": "vitest --run"` script. Unit and property tests live in `tests/unit/` and import only the pure modules (`userAgent.ts`, `urlClassifier.ts`, `darkMode.ts`, `adblock/engine.ts`, `adblock/youtubeAdController.ts`, `permissions.ts` with an in-memory store and stub prompt, `greeting.ts`, `mcp/server.ts`). Integration tests live in `tests/integration/` as Electron scripts. Live tests that hit Google or YouTube run only when `NEUTRINO_LIVE_TESTS=1`, because their results depend on Google's servers, the account, the IP and the ads served.

To compare F and F', copy the original `checkUrl`, `isAuthOrSecurityUrl`, window-open decision and greeting into `tests/unit/fixtures/original/` before changing them.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Run unit tests against the unfixed modules to capture concrete counterexamples, then run two Electron ablation harnesses that change one variable at a time.

**Test Cases**:
1. **UA shape test**: assert `CHROME_USER_AGENT` is not Chrome-shaped and contains `process.versions.chrome` (will fail on unfixed code: it is Chrome-shaped and literal).
2. **Header coherence test**: Electron harness loads `http://127.0.0.1:<port>/` from a local server in `persist:neutrino`, records the request headers server-side and `navigator.userAgent` / `navigator.userAgentData` in the page, and compares them (will fail on unfixed code: `"Google Chrome"` in `Sec-CH-UA`, missing from `brands`; `"Windows"` on macOS and Linux).
3. **Google sign-in ablation (live)**: following orca#11518's method, a fresh profile per run, type a disposable non-existent Gmail address into `accounts.google.com`, submit with `webContents.sendInputEvent`, and classify the resulting URL as rejected or not. Arms: (a) current UA and forged hints, (b) current UA with untouched hints, (c) new UA and forged hints, (d) new UA and untouched hints, three runs each in random order. Expected if the hypothesis holds: (a) and (b) rejected, (c) and (d) not. If (c) or (d) is rejected, re-hypothesize before implementing.
4. **Ad controller test**: drive the unfixed skipper logic with a fake player and video: ad class on for three ticks, then off. Assert `currentTime` is never written and the rate returns to 1 (will fail on unfixed code: `currentTime = duration`, rate stays 16).
5. **Tracking block test**: `checkUrl('https://www.youtube.com/ptracking?ei=x')` returns `blocked: false` (will fail on unfixed code).
6. **Dialog rule test**: `getCosmeticFilterCSS()` contains no `tp-yt-paper-dialog` selector (will fail on unfixed code).
7. **YouTube ablation (live)**: an Electron harness opens a fixed set of watch pages and records, over 30 s each: `currentTime` progress, `playbackRate` after any ad, visible-but-hidden dialogs while `video.paused`, blocked `youtube.com` and `googlevideo.com` requests, and long-task time. Arms: baseline (all on), then each of ad skipper off, dialog rule off, `/ptracking` unblocked, DarkReader off, GPU switches off. The arm whose removal restores playback confirms the cause; the expected order is the ranking in Hypothesized Root Cause (may fail in several arms on unfixed code).
8. **Release artifact tests**: greeting with empty storage contains no name; `initialize` returns `0.2.0`; packaging the unfixed project and running `verify_package_contents.cjs` lists `tests/` and `scratch/` (will fail on unfixed code).

**Expected Counterexamples**:
- `User-Agent` ends in `Chrome/130.0.0.0 Safari/537.36` with no product token; `Sec-CH-UA` contains `"Google Chrome"` while `brands` does not.
- Ad controller trace: `currentTime := duration` on tick 1, `playbackRate = 16` after the ad.
- `checkUrl` blocks `/ptracking`; the cosmetic CSS hides `tp-yt-paper-dialog`.
- Possible causes if the live arms disagree with the ranking: GPU driver specific, or YouTube serving a different ad format on that run; repeat with more videos before re-hypothesizing.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := F'(input)
  ASSERT expectedBehavior(input, result)
END FOR

FUNCTION expectedBehavior(input, result)
  CASE input OF
    Request:
      ua := result.headers["User-Agent"]
      RETURN ua = navigator.userAgent
         AND ua = buildUserAgent(defaultUA, "Neutrino", appVersion, process.versions.chrome)
         AND NOT isChromeShaped(ua) AND NOT contains(ua, "Electron/")
         AND result.headers["Sec-CH-UA"] = chromiumGeneratedHint()
         AND brands(result.headers["Sec-CH-UA"]) = navigator.userAgentData.brands
         AND "Google Chrome" NOT IN brands(result.headers["Sec-CH-UA"])
         AND platformHint(result) = realPlatform()
    PageLoad on Google auth host:
      RETURN NOT isRejectionPage(result.urlAfterIdentifier)
         AND (input.context = popup IMPLIES result.openerKept)
    PageLoad on rejection page:
      RETURN result.fallbackOffered AND scheme(result.externalUrl) IN ["http", "https"]
    PageLoad with forceDark on native-dark site:
      RETURN NOT result.darkReaderEvaluated
    PlayerTick sequence:
      RETURN result.currentTimeWrites = 0
         AND (NOT adState IMPLIES video.rate = savedRate AND video.muted = savedMuted)
    Request playback-critical:
      RETURN NOT result.blocked
    DialogShown:
      RETURN NOT matchesCosmeticCss(input.element)
    GpuStartup:
      RETURN FORCED_GPU_SWITCHES ∩ appliedSwitches = ∅
    Render greeting with empty name:
      RETURN result.text IN ["Good morning", "Good afternoon", "Good evening"]
    McpInitialize:
      RETURN result.serverInfo.version = app.getVersion()
    Render assistant chips:
      RETURN no chip badge IN ["3.5", "4o", "Flash", "R1"]
    Render shield panel:
      RETURN label contains "Est."
    Package:
      RETURN NOT EXISTS f IN result.fileList: matchesIgnoreList(f) OR containsUserPath(f)
    PermissionRequest sensitive without remembered grant:
      RETURN result.prompted OR result.denied
    PopupOpen:
      RETURN result.title != "Sign In" OR pageTitle = "Sign In"
    TabLoadFailure in production:
      RETURN result.consoleWrites = 0
  END CASE
END FUNCTION
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT F(input) = F'(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-YouTube URLs, auth URLs, window-open requests, named greetings and MCP tool calls, save the original functions as fixtures, then write property-based tests that compare the fixtures with the fixed modules.

**Test Cases**:
1. **Shield decision preservation**: generate URLs from `KNOWN_TRACKERS` domains with random subdomains, paths and queries, random benign URLs, and the existing ad patterns; observe the original `checkUrl` result and stats delta; assert equality for every URL that is not playback-critical (Property 10).
2. **Auth classifier preservation**: generate URLs from the identity-provider hosts, CAPTCHA hosts and random paths containing `/oauth`, `/auth`, `/login`, `/signin`, `/signup`, `/otp`, `/token`; assert the fixed `isAuthOrSecurityUrl` equals the original (Property 11).
3. **Window-open preservation**: generate `{ url, disposition, features }` triples; assert the same allow-or-tab decision and the same popup options apart from `title` (Property 11).
4. **Dark-mode decision preservation**: generate URLs on ordinary hosts, auth hosts, `neutrino://` and `about:`; assert `shouldInjectDarkReader` equals the original eligibility check for every host not in `NATIVE_DARK_HOSTS` (Property 12).
5. **Greeting preservation**: generate non-empty names and hours 0 to 23; assert `formatGreeting` equals the original output (Property 13).
6. **MCP tool preservation**: call each of the eight tools with recorded parameters against a stub `BrowserManager`; assert the same result and log entry (Property 13).
7. **Permission preservation**: generate origins with remembered allows; assert grant with zero prompts. Generate safe permissions; assert grant with zero prompts (Property 13).

### Unit Tests

- `buildUserAgent` for Windows, macOS and Linux default UAs and for an unparseable default UA (platform fallback).
- `isGoogleAuthUrl`, `isYouTubeHost`, `isRejectionPage` and `isPlaybackCriticalRequest` on lookalike hosts (`accounts.google.com.evil.test`, `notyoutube.com`) and real hosts.
- `checkUrl` on each playback-critical endpoint and each YouTube ad endpoint; cosmetic CSS has no dialog selector.
- Ad controller: ad begins and ends, back-to-back ads, ad begins while the user had set 1.5x and muted, player element replaced mid-ad.
- Permission handlers: prompt Allow with remember, prompt Block without remember, concurrent duplicate requests share one prompt, no window means deny, unknown permission denied.
- `formatGreeting` hour boundaries (11:59, 12:00, 16:59, 17:00) with and without a name; `McpServer` `initialize` version; the open-external IPC rejects `file:` and `javascript:` URLs and unknown webContents ids.

### Property-Based Tests

- Generate random OS tokens, app versions and Chromium versions: the built UA is never Chrome-shaped, contains `Chrome/<version>` and exactly one `Neutrino/` token before it, and never contains `Electron/` (Property 1).
- Generate random tick sequences of ad and non-ad states with random starting rate and mute: `currentTime` is never written, and after every ad-to-content transition rate and mute equal their pre-ad values (Property 5).
- Generate playback-critical URLs with random query strings: never blocked; generate YouTube ad URLs: always blocked (Property 6).
- Generate random origins and sensitive permissions with no stored decision: never granted without a prompt (Property 9).
- Preservation properties 10 to 13 as listed under Preservation Checking.

### Integration Tests

- Header coherence harness (exploratory case 2) on Windows, and on macOS and Linux where available: User-Agent, `navigator.userAgent`, `userAgentData` and `Sec-CH-UA*` all agree after the fix.
- Live Google sign-in (opt-in) in a tab, in a popup opened from a test relying-party page that calls `window.open` with features, and in the assistant drawer: reach a non-rejection step and keep `window.opener`. Force a rejection by temporarily loading the old UA and check the banner, the popup dialog and that `shell.openExternal` receives the recorded URL.
- Live YouTube (opt-in) with force dark and shields on: video time advances, rate is 1 after an ad, no DarkReader global in the page, no `googlevideo.com` or `/ptracking` request blocked, and the page is dark through its own theme. Switch theme and tabs during playback: the mini player shows, the tab stays awake and no reload happens (3.7, 3.11).
- Non-Google sign-in smoke tests for GitHub and Microsoft popups and a Turnstile demo page load (3.1, 3.2); restart the app and confirm the session is still signed in (3.3).
- Permission flow: a local page requests camera, the prompt appears, Allow with remember, reload and request again with no prompt (2.18, 3.15).
- Package and run `verify_package_contents.cjs`; launch the packaged build, trigger a failed tab load and confirm no console output; confirm `VITE_DEV=true npm start` still uses the dev server (2.17, 2.20, 3.16).
