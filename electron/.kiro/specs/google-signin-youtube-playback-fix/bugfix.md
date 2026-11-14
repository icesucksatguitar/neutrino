# Bugfix Requirements Document

## Introduction

Neutrino has three release-blocking problem areas.

1. **Google sign-in is rejected.** Signing in to a Google account in a tab, in a sign-in popup, or in the assistant drawer ends on Google's "This browser or app may not be secure" page. The browser sends a user-agent that looks exactly like stock desktop Chrome with a frozen version (`Chrome/130.0.0.0`) and always claims Windows. It also forces a `"Google Chrome"` brand in the `Sec-CH-UA` request headers that does not match what the page's JavaScript reports (`navigator.userAgentData`). Public reports from other Electron browsers show that, at the time of writing, Google rejects Chrome-shaped user-agents from embedded Chromium. The same reports say a user-agent carrying an extra product token gets through to the password step ([stablyai/orca#11518](https://github.com/stablyai/orca/issues/11518)). Google does not document this check and can change it, so the fix must keep a fallback path for when in-app sign-in is refused.
2. **YouTube playback is broken.** Several things the app injects into YouTube can stall or break the player. The force-dark engine (DarkReader) is injected into YouTube even though YouTube has its own dark theme. The ad skipper seeks the video to its end and sets the playback rate to 16x whenever ad markers are present, and nothing ever resets that rate. Network rules block YouTube playback-tracking endpoints. A cosmetic rule hides YouTube dialogs that pause the player, so the user cannot see why the video stopped. Aggressive GPU switches (`ignore-gpu-blocklist`, `enable-zero-copy`, `enable-native-gpu-memory-buffers`) are also forced on every machine. The design phase must confirm which of these cause the failure.
3. **The build is not release ready.** Things the end user can see still carry developer-specific values. These include the developer's first name as the default greeting, a stale MCP server version, stale model badges, and an estimated bandwidth figure shown as if it were measured. The packaged app also bundles developer-only files, and every site gets every permission granted without a prompt.

## Bug Analysis

### Current Behavior (Defect)

**Google sign-in**

1.1 WHEN a user opens a Google sign-in page (accounts.google.com) in a browser tab and submits an email address THEN the system is shown Google's "This browser or app may not be secure" rejection page instead of the password or challenge step

1.2 WHEN a site opens "Sign in with Google" in a popup window (for example chatgpt.com, claude.ai or a third-party OAuth flow) THEN the system shows the same Google rejection in the popup and the sign-in cannot complete

1.3 WHEN a user signs in to Google inside the assistant drawer (for example Gemini) THEN the system shows the same Google rejection

1.4 WHEN any page loads THEN the system sends a user-agent with a hard-coded Chrome version (`130.0.0.0`) that does not follow the Chromium version actually bundled with the app

1.5 WHEN the app runs on macOS or Linux THEN the system still reports the Windows platform in the user-agent and in the `Sec-CH-UA-Platform` header

1.6 WHEN any request is sent THEN the system rewrites the `Sec-CH-UA` headers to claim a `"Google Chrome"` brand that does not match the brands the page reads from `navigator.userAgentData`, and adds client-hint headers to requests that would not normally carry them

1.7 WHEN Google still refuses in-app sign-in THEN the system gives the user no way to continue, such as opening the page in the system browser

**YouTube playback**

1.8 WHEN force dark mode is on and a YouTube page loads or the user moves to another video THEN the system injects the full DarkReader engine into YouTube and re-runs it, which can stall the player or keep its rendering busy

1.9 WHEN a YouTube page carries an ad marker class (`.ad-showing` or `.ad-interrupting`) THEN the system's ad skipper jumps the current video to its end and sets the playback rate to 16x, and never sets the rate back after the ad. The real video can then play at 16x or be skipped to its end.

1.10 WHEN shields are on and a YouTube video plays THEN the system blocks YouTube playback-tracking requests (for example `/ptracking` and `/api/stats/` endpoints), which YouTube can treat as ad blocking and answer by stalling or refusing playback

1.11 WHEN YouTube shows a dialog that pauses the player THEN the system hides that dialog with a cosmetic rule, so the video stays paused and the user cannot see why

1.12 WHEN a YouTube video plays on a machine whose GPU or driver is on Chromium's blocklist THEN the system forces GPU features on anyway, which can produce a black or frozen video

**Release readiness**

1.13 WHEN a user has not entered a name THEN the system greets them by the developer's first name ("Yash") on the home screen and in the MCP drawer, and the welcome modal fills in that name and uses it as its input example

1.14 WHEN an MCP client asks the built-in MCP server for its version THEN the system reports `0.1.0`, which does not match the app version in package.json (`0.2.0`)

1.15 WHEN the assistant drawer lists Claude, ChatGPT, Gemini, DeepSeek and Perplexity THEN the system shows fixed model-version badges ("3.5", "4o", "Flash", "R1") as if they were the models currently in use

1.16 WHEN the shield panel shows "Bandwidth Saved" THEN the system shows a number computed from a fixed 54 KB per blocked request as if it were measured

1.17 WHEN the app is packaged for release THEN the system bundles developer-only files into the shipped app, including tests and scratch scripts with a developer's local paths and test email, prompt documents, screenshots and Python helper scripts

1.18 WHEN any website asks for a permission (camera, microphone, location, notifications, clipboard and so on) THEN the system grants it silently without asking the user

1.19 WHEN any site opens a popup window THEN the system titles it "Sign In", even when the popup has nothing to do with signing in

1.20 WHEN a page in a tab fails to load THEN the system writes developer debug output to the console

### Expected Behavior (Correct)

**Google sign-in**

2.1 WHEN a user opens a Google sign-in page in a browser tab and submits an email address THEN the system SHALL reach Google's password or challenge step and not the "This browser or app may not be secure" page

2.2 WHEN a site opens "Sign in with Google" in a popup window THEN the system SHALL let the sign-in finish in the popup, keep the link back to the opening page (`window.opener`), and return the user to the opening site signed in

2.3 WHEN a user signs in to Google inside the assistant drawer THEN the system SHALL let the sign-in finish there, or offer the fallback in 2.7 when Google refuses

2.4 WHEN any page loads THEN the system SHALL send a user-agent whose Chrome version matches the Chromium version bundled with the app, with no version number hard-coded in the source

2.5 WHEN the app runs on any operating system THEN the system SHALL report that real operating system in the user-agent and in the client hints

2.6 WHEN any request is sent THEN the system SHALL keep the user-agent header, `navigator.userAgent`, `navigator.userAgentData` and the `Sec-CH-UA*` headers consistent with each other, and SHALL NOT claim a `"Google Chrome"` brand the runtime does not have

2.7 WHEN Google still refuses in-app sign-in THEN the system SHALL offer the user a clear way to continue, such as an "Open in system browser" action, instead of leaving them at the rejection page

**YouTube playback**

2.8 WHEN force dark mode is on and a YouTube page loads or the user moves to another video THEN the system SHALL play the video normally. It SHALL NOT inject the DarkReader engine into sites that have their own dark theme (YouTube included) and SHALL use the site's own dark theme where one exists.

2.9 WHEN a YouTube ad is actually playing THEN the system SHALL skip it without changing the real video. Playback SHALL return to the normal rate after the ad, and the real video SHALL NOT jump to its end.

2.10 WHEN shields are on and a YouTube video plays THEN the system SHALL let the playback, streaming (googlevideo.com) and playback-tracking requests that the player needs go through, while still blocking ad requests

2.11 WHEN YouTube shows a dialog that pauses the player THEN the system SHALL NOT hide it, so the user can see and act on it

2.12 WHEN a YouTube video plays on any supported machine THEN the system SHALL respect Chromium's GPU blocklist and its default video-decode safeguards, so video renders and plays

**Release readiness**

2.13 WHEN a user has not entered a name THEN the system SHALL show a neutral greeting with no name (for example "Good evening") on the home screen and in the MCP drawer, and the welcome modal SHALL use a generic input example and leave the name empty

2.14 WHEN an MCP client asks the built-in MCP server for its version THEN the system SHALL report the app version from package.json

2.15 WHEN the assistant drawer lists providers THEN the system SHALL NOT show fixed model-version badges. It SHALL show only facts that stay true, such as the provider name.

2.16 WHEN the shield panel shows bandwidth saved THEN the system SHALL either label the number clearly as an estimate or compute it from measured data

2.17 WHEN the app is packaged for release THEN the system SHALL leave tests, scratch scripts, prompt documents, screenshots, Python helper scripts and any other developer-only files out of the shipped app

2.18 WHEN a website asks for a sensitive permission (camera, microphone, location, notifications and similar) THEN the system SHALL NOT grant it silently. It SHALL ask the user or deny by default.

2.19 WHEN a site opens a popup window THEN the system SHALL title it from the page it loads, not from a fixed "Sign In" label

2.20 WHEN a page in a tab fails to load THEN the system SHALL NOT write developer debug output to the console in a production build

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user signs in with non-Google identity providers (GitHub, Microsoft, Apple, Auth0, Clerk, Supabase) in a tab or popup THEN the system SHALL CONTINUE TO complete the sign-in and return the user to the opening site

3.2 WHEN a site shows a CAPTCHA or bot challenge (reCAPTCHA, hCaptcha, Cloudflare Turnstile) THEN the system SHALL CONTINUE TO load it without shields blocking it

3.3 WHEN a user is already signed in to a site in the `persist:neutrino` session THEN the system SHALL CONTINUE TO keep that login across restarts

3.4 WHEN a page opens a regular `target="_blank"` link or calls `window.open` without popup features THEN the system SHALL CONTINUE TO open it as a new Neutrino tab in the active space

3.5 WHEN force dark mode is on and a site without its own dark theme loads THEN the system SHALL CONTINUE TO darken it with DarkReader

3.6 WHEN force dark mode is on and an auth, security or `neutrino://` page loads THEN the system SHALL CONTINUE TO leave that page unstyled

3.7 WHEN the user switches between dark and light mode THEN the system SHALL CONTINUE TO update the browser chrome, the native theme and the open tabs without a reload

3.8 WHEN shields are on and a non-YouTube page loads THEN the system SHALL CONTINUE TO block the same ad, tracker, analytics, fingerprinting and cryptomining domains and apply the same cosmetic filters

3.9 WHEN shields block a request THEN the system SHALL CONTINUE TO raise the tracker-blocked event and update the blocked counts shown in the shield panel and toolbar

3.10 WHEN shields are off THEN the system SHALL CONTINUE TO block nothing and inject no ad-skipping script

3.11 WHEN a YouTube video or other media plays and the user switches or opens tabs THEN the system SHALL CONTINUE TO keep it playing in the background, show the mini player, and keep the tab out of the Zen sleep pass

3.12 WHEN an MCP client calls any existing tool (`browser_navigate`, `browser_list_tabs`, `browser_create_tab`, `browser_close_tab`, `browser_get_adblock_stats`, `browser_zen_optimize`, `browser_media_control`, `browser_get_status`) THEN the system SHALL CONTINUE TO return the same results and log the call

3.13 WHEN a user has entered a name in the welcome modal THEN the system SHALL CONTINUE TO greet them by that name on the home screen and in the MCP drawer

3.14 WHEN the user uses tabs, spaces (Study, Work, Leisure), keyboard shortcuts, zoom, the command bar or the theme customizer THEN the system SHALL CONTINUE TO behave as it does today

3.15 WHEN a website asks for a permission the user has already allowed for that site THEN the system SHALL CONTINUE TO grant it without asking again

3.16 WHEN a developer runs the app with `VITE_DEV=true` THEN the system SHALL CONTINUE TO load the renderer from the local dev server, and the files in tests/ SHALL CONTINUE TO be available in the repository

3.17 WHEN a PDF opens in a tab with dark mode on THEN the system SHALL CONTINUE TO apply the dark PDF viewer style
