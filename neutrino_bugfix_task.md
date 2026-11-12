# Task: Fix bugs and performance issues in the Neutrino browser

You are working on **Neutrino**, a desktop browser with a Spaces sidebar, tab previews, a built-in adblocker, and a customization tab. Fix the issues below.

## Ground rules

1. **Explore first.** Read the project structure, build setup, and the code for tabs, spaces, theming, adblock, rendering, and settings. Don't assume the stack, so confirm it from the code.
2. **Plan before coding.** Write a short plan listing the root cause and files to change for each bug.
3. **Work in priority order** (below), one issue at a time, with a small focused commit or change per issue.
4. **Find root causes**, not band-aids. If a bug is caused by another one, say so.
5. **Don't break existing features.** Run existing tests and the build after each fix. Add tests where practical.
6. **If something is ambiguous** or needs a product decision, make a sensible choice, note it, and continue.

---

## Priority 1: Broken core functionality

### 1. Cannot add a new Space

- Clicking "add space" does nothing or fails.
- Trace the click handler → state/store → persistence → UI render, and find where it breaks.
- Expected: a new space is created, persisted, shown in the sidebar, and selected.
- Check the console for errors and for state that never updates.

### 2. Switching Spaces does nothing

- Selecting another space has no visible effect.
- Expected: the active space changes, its tabs load, the sidebar highlights it, and the choice persists across restarts.
- Likely related to #1, so check for shared state or event bugs.

### 3. Adblocker doesn't work

- Verify that filter lists load, parse, and are actually applied to network requests.
- Check that the request interception hook is registered and not silently failing.
- Confirm blocking with test pages and a request log.
- Expected: ads and trackers on common sites are blocked, and there is a visible on/off toggle that works.

---

## Priority 2: Performance

### 4. Laggy without hardware acceleration and on low-end PCs

### 5. High system resource usage

Treat these together and profile before optimizing.

- Profile CPU, GPU, and memory at idle and with 10+ tabs.
- Look for: unthrottled animations, blur and transparency effects, per-frame re-renders, polling loops, leaked listeners, background tabs that stay active, and large uncompressed assets.
- Implement fixes such as:
  - Suspend or throttle background tabs.
  - Replace expensive effects with cheap CSS or GPU-friendly equivalents, with a fallback when hardware acceleration is off.
  - Debounce and throttle event handlers, and fix memory leaks.
  - Lazy-load UI that isn't visible.
- Add a "reduced effects / low-end mode" setting, auto-enabled when hardware acceleration is unavailable.
- Report before/after numbers.

### 6. Random visual artifacts on webpages

- Investigate GPU or compositor issues: rendering flags, hardware acceleration settings, overlay layers, and transparency or scaling interactions with web content.
- Check the launch flags and renderer settings for risky or experimental options.
- Expected: no flicker, tearing, or garbled regions on common sites, with and without hardware acceleration.

---

## Priority 3: UI/UX polish

### 7. Tab preview stays dark when the browser is in light theme

- The tab preview or hover card doesn't follow the active theme.
- Make it use the same theme tokens or variables as the rest of the UI, and update live when the theme changes.

### 8. Spaces sidebar alignment is off

- Audit padding, margins, icon sizes, flex alignment, and baselines.
- Make spacing consistent and pixel-aligned across all items, including active, hover, and overflow states.
- Check at different window sizes and DPI scales.

### 9. Feature: presets on the Customizability tab

- Add the ability to **save, name, load, rename, and delete** presets of the customization settings.
- Persist them with the rest of the settings, and include a way to reset to default.
- Keep the UI consistent with the existing customization tab.

---

## Definition of done

- [ ] All 9 items addressed, or clearly explained if not fixable
- [ ] Build and existing tests pass
- [ ] Manual verification steps listed for each fix
- [ ] Summary at the end: root cause, fix, and files changed per issue
- [ ] Any remaining risks, follow-ups, or decisions I need to make
