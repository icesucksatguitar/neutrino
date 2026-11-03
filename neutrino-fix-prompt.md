# Neutrino Browser: Full UI Repair + Redesign (Dark Theme)

You are working on **Neutrino Browser** (Electron). The last UI pass broke the home screen. Fix everything in this document in **one pass**, run the app, verify against the checklist at the end, and fix anything that fails before you report back. Do not stop to ask questions. Where something is ambiguous, use the defaults given here.

## 0. Ground rules

- **Preserve all existing functionality.** Tab create/close/switch, back/forward/reload, URL/search logic, adblock shield counter, Zen mode, the Default/Plan/Max slider state and logic, and the whole MCP server with its tools (`browser_navigate`, `browser_list_tabs`, `browser_create_tab`, `browser_close_tab`, `browser_get_adblock_stats`, `browser_zen_optimize`) and its protocol-call log. Change presentation and add features only. Do not rename IPC channels or main-process APIs that already work.
- **Do not rewrite the app from scratch.** Run `git status` and `git diff` first to see what the previous pass changed. Revert or repair anything that broke layout. Keep what works.
- **One source of truth for styling.** All colors, radii, shadows, fonts and spacing live as CSS variables in a single `:root` block. No hard-coded hex values elsewhere.
- No console errors or warnings from your code. UI interactions stay smooth at 60 FPS.

## 1. What is currently broken (diagnose and fix first)

Looking at the current home screen, these are the problems:

1. **The home view has collapsed to the top ~150px of the window.** The wordmark, URL bar and slider are all squashed into a thin strip and the rest of the window is empty. The home container needs a real height: make it `position: fixed; inset: 0` (or `height: 100vh; width: 100vw`) and lay it out with flexbox/grid. Check every parent in the chain for a missing height, `overflow: hidden`, or an absolutely positioned child with no size.
2. **The ASCII art does not cover the screen.** It is clipped into a small box at the top. It must fill the entire window (see section 4).
3. **The slider overlaps the URL bar.** It is absolutely positioned at the wrong place. It must live in the bottom-left corner (see section 6).
4. **The URL bar is not centered on screen**, and it has no real glass separation from the background.
5. **The theme is a flat light gray**, with poor contrast and no depth. The app is switching to a proper **dark theme** (section 2).
6. The tab sidebar is too narrow and does not read as a floating panel.

After fixing, the home screen must look correct at **1920x1080, 1366x768 and 1280x720**, and when the window is resized.

## 2. Dark theme (whole app)

Apply to the title bar, toolbar, sidebar, home screen, modals, MCP drawer and media player. Define these tokens (adjust slightly if needed, but keep the dark, cool, low-saturation feel):

```css
:root {
  --bg:            #0b0d12;
  --bg-elevated:   #11141b;
  --surface:       rgba(22, 26, 35, 0.72);
  --surface-solid: #161a23;
  --surface-hover: #1d222d;
  --border:        rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
  --text:          #e8eaf0;
  --text-muted:    #9aa1b2;
  --text-faint:    #6b7385;
  --accent:        #7c9cff;
  --accent-soft:   rgba(124, 156, 255, 0.16);
  --success:       #4ade80;
  --danger:        #f87171;
  --art:           #5d6a85;   /* ASCII background color */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
}
```

- Every piece of text must meet **WCAG AA contrast** against its background. Fix any text that is currently dark-on-dark or pale-on-pale (the "New Tab" labels and MCP panel title have had this problem).
- Set `color-scheme: dark` so native scrollbars and form controls match.
- Websites loaded in tabs are NOT restyled. Only the browser chrome is themed.

## 3. Typography (must not look like AI-template UI)

- **Banned fonts:** Inter, Roboto, Poppins, Plus Jakarta Sans, Space Grotesk, system-ui as the primary face.
- **Headings / wordmark:** `Instrument Serif` or `Fraunces`.
- **UI text:** `Switzer`, `General Sans` or `DM Sans` (self-host or bundle the font files so it works offline; do not rely on a CDN at runtime).
- **Code / tool names / ASCII art:** `JetBrains Mono` or `IBM Plex Mono`.
- Consistent scale: 12 / 13 / 14 / 16 / 20 / 32 px. Tight, deliberate letter-spacing on the wordmark. No all-caps shouting labels.

## 4. Home screen background: ASCII clouds + a jet

- **Delete the New York skyline entirely.**
- Render ASCII art of **layered clouds with a single small jet flying through them**, as a fixed full-window layer: `position: fixed; inset: 0; z-index: 0; pointer-events: none;`. It sits behind the toolbar, sidebar and every other UI element, and must cover the **entire** window, including behind the toolbar.
- Implementation: compute `cols = floor(window.innerWidth / charWidth)` and `rows = floor(window.innerHeight / lineHeight)` from the actual monospace metrics, regenerate on `resize` (debounced), and draw into a single `<pre>` or `<canvas>`. Never hard-code a fixed row count.
- **Minimal:** thin line-art made of characters like `. - ~ ( ) _ / \ =` , a handful of cloud shapes at different depths, one jet, lots of empty space. Color is `var(--art)` at low opacity (about 0.35 to 0.5) so it reads as texture, not as content.
- **Very subtle animation.** This is a hard requirement:
  - Clouds drift horizontally very slowly, with at most 2 parallax layers (far layer slower than near).
  - The jet moves slowly across the sky and leaves a faint contrail that fades out.
  - **No** twinkling, blinking, flickering or per-character randomness.
  - Render at 6 FPS or lower (`setInterval` or throttled `requestAnimationFrame`).
  - Pause when the home view is hidden or the window is blurred.
  - Respect `prefers-reduced-motion: reduce` by rendering one static frame.
- The art must not hurt readability of the URL bar or the wordmark. A soft vignette toward the center is fine.

## 5. URL bar (center, glass)

- Centered horizontally and vertically on the home screen, slightly above true center, **on top of** the ASCII art.
- Width `clamp(420px, 42vw, 640px)`, height 52px, fully rounded.
- Glassmorphism: `background: var(--surface); backdrop-filter: blur(18px) saturate(140%); border: 1px solid var(--border-strong); box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,0.06);`. It should be clearly separated from the art behind it.
- Optional small wordmark "Neutrino" above it in the serif font, understated, not huge.
- Keep ALL existing behavior: search Google or enter a URL, Enter to navigate, focus state (accent ring), the search icon.

## 6. Mode slider (bottom-left)

- Move the **Default / Plan / Max slider** to the **bottom-left corner** of the home screen: `position: fixed; left: 24px; bottom: 24px;`, width about 160px. It must not overlap anything.
- **Remove the text labels** (DEFAULT, PLAN, MAX).
- **Keep the original slider component untouched:** same gradient track, same handle, same snap points, same state and event logic. Only its position and surrounding labels change.
- Show a small tooltip with the current mode name while hovering or dragging so it is still usable.

## 7. Floating tabs sidebar (left)

- A floating panel: `position: fixed; left: 12px; top: 64px;`, width **280px**, `max-height: calc(100vh - 88px)`, scrollable, with `var(--surface)`, `backdrop-filter: blur(14px)`, `--radius-lg`, `--shadow`.
- Tab rows: 40px tall, favicon + title with ellipsis truncation + close button on hover. Clear states:
  - default: transparent, `--text-muted`
  - hover: `--surface-hover`, `--text`
  - active: `--accent-soft` background, 1px `--accent` border, `--text`
- Keep the "New Tab" button at the top. Tab switching, closing and reordering (if present) must keep working. The sidebar can still collapse with the existing toggle button in the toolbar.

## 8. Toolbar

- Dark, translucent, same height as now. Back / forward / reload, the sidebar toggle, the adblock shield pill, the Zen pill, the MCP button and the palette button all keep their behavior. Restyle to the dark tokens, with visible hover and focus-visible states.

## 9. MCP panel: full redesign as a right-side drawer

Replace the old centered modal with a **right-side drawer** (width 420px, full height below the toolbar, slides in, dark glass surface, closes with Esc or the close button). It has three tabs: **Assistants**, **Local models**, **Tools**.

### 9a. Assistants tab
- Show three large logo cards: **Claude**, **ChatGPT**, **Gemini** (use clean SVG logos stored locally in the app assets).
- Clicking a card opens that assistant **inside the same drawer** and the user continues there. Use an Electron **`<webview>`** (set `webviewTag: true` in the BrowserWindow `webPreferences`) or a `BrowserView`. **Do not use `<iframe>`**, these sites block framing.
- Each provider gets its own **persistent session partition** (`persist:claude`, `persist:chatgpt`, `persist:gemini`) so logins survive restarts.
- URLs: `https://claude.ai`, `https://chatgpt.com`, `https://gemini.google.com`. If the user is not signed in, the site's own sign-in/sign-up page is what they see, which is the intended redirect to sign up.
- Set a normal desktop Chrome user-agent on these webviews so Google sign-in is not rejected as an "embedded browser". If a provider still refuses to sign in inside the panel, show an "Open in a regular tab" button as a fallback.
- A provider switcher (three small logo buttons) stays pinned at the top of the drawer so the user can switch without closing it. Keep each webview alive when switching so the conversation is not lost.
- Optional: a "Send current page to assistant" button (copies the active tab URL and title to the clipboard and focuses the assistant input).

### 9b. Local models tab
- On open (and on a "Rescan" button), auto-detect local runtimes from the system:
  - **Ollama:** `GET http://localhost:11434/api/tags`
  - **LM Studio:** `GET http://localhost:1234/v1/models`
- Do these requests from the **main process** (to avoid CORS), exposed through the existing preload/IPC pattern.
- List detected models with name and size, grouped by runtime. Selecting one loads it and opens a chat view in the drawer with a message list, an input box and **streaming responses** (Ollama: `POST /api/chat` with `stream: true`; LM Studio: OpenAI-compatible `POST /v1/chat/completions` with `stream: true`).
- Empty state when nothing is found: short install hints for Ollama and LM Studio and a Rescan button.
- Handle errors gracefully: runtime offline, model failed to load, request aborted. Include a Stop button while generating.

### 9c. Tools tab
- Move the existing registered tools list and the "Recent MCP Protocol Calls" log here, restyled to the dark theme with the mono font. Each tool keeps its run (play) button. The log must still update live.
- Add one new tool: `browser_media_control` (see section 10).
- Show a small status row: "Native MCP Server: Active".

## 10. Persistent media player

- A floating mini player that **keeps playing media when the user opens a new tab or switches tabs**.
- Detect media playing in any tab (audio or video), using the webContents `media-started-playing` and `media-paused` events or equivalent. When the user leaves a tab that is playing, keep that tab's webContents alive in the background and show the mini player.
- The mini player shows: title, favicon, play/pause, seek bar (if seekable), volume, a "go to tab" button and a close button. For video, show the video itself.
- Draggable, snaps to the four corners, and sits above the home screen and web content but below modals. Default position: bottom-right, so it never collides with the bottom-left slider.
- **Zen mode's RAM purge (`browser_zen_optimize`) and any tab discarding must skip tabs that are playing media.**
- Expose `browser_media_control` over MCP with actions `play`, `pause`, `status`.

## 11. Implementation order (do it in this order)

1. Inspect `git diff`, find and fix why the home view collapsed (section 1). Get a correct empty layout first.
2. Add the CSS token block and apply the dark theme everywhere (sections 2, 3, 8).
3. Rebuild the ASCII clouds + jet background (section 4).
4. Position the URL bar, wordmark and slider (sections 5, 6).
5. Rework the sidebar (section 7).
6. Build the MCP drawer: Tools tab first (moving existing code), then Assistants, then Local models (section 9).
7. Add the persistent media player (section 10).
8. Verify (section 12).

## 12. Verification (required before you report done)

Launch the app and take screenshots at 1920x1080 and 1280x720. Then confirm each item, fixing any failure:

- [ ] Home screen fills the window. Nothing is squashed into the top strip.
- [ ] ASCII clouds + jet cover the whole window (including behind the toolbar), are subtle, and move slowly. No flicker.
- [ ] URL bar is centered, about 42% wide, with visible glass blur. It is readable over the art.
- [ ] Slider is bottom-left, no text labels, original look and snapping preserved, tooltip works, and the mode value still changes app behavior.
- [ ] Sidebar is floating, about 280px wide, with clear active/hover colors and readable text.
- [ ] The whole app is dark. No unreadable text anywhere (check the tab list, toolbar pills, MCP drawer, modals).
- [ ] Fonts are the new pairing, no banned fonts.
- [ ] New tab, close tab, switch tab, back, forward, reload all work. Typing a URL or a search navigates.
- [ ] Adblock shield counter and Zen button still work.
- [ ] MCP drawer opens and closes. The three tabs work. Claude, ChatGPT and Gemini load in the drawer with persistent logins and the switcher works. The local models tab detects Ollama or LM Studio when running and streams a reply. The Tools tab lists all 6 original tools plus `browser_media_control` and the call log updates.
- [ ] Start a YouTube video, open a new tab: audio keeps playing and the mini player appears with working controls. `browser_zen_optimize` does not kill that tab.
- [ ] No console errors. Resizing the window re-renders the ASCII art to fit.

When finished, give a short summary of what changed and the checklist with pass/fail for each item.
