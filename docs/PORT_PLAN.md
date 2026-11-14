# Neutrino Port Plan: Electron → Rust + Tauri v2

This document details the architectural strategy, phase progression, and risk mitigations for translating Neutrino into a high-performance **Rust + Tauri v2** browser.

---

## 1. Executive Summary & Architecture Strategy

The porting strategy centers on **zero UI regressions** and **maximum native performance**:
1. **Frontend Reuse:** The React 18 / TypeScript frontend in `electron/src/renderer` is reused in `rust/ui`. It retains all design tokens, CSS variables, themes, animations, pixel icons, and component structures.
2. **IPC Emulation Layer:** Rather than rewriting hundreds of React components to call Tauri directly, we provide a lightweight adapter layer that implements the exact `window.neutrino` API on top of Tauri's `invoke()` and `listen()` primitives.
3. **Rust Core:** All state management (tabs, Spaces, settings, presets, history, shields, VPN) is implemented in clean, modular Rust crates within a Cargo workspace, ensuring memory safety, low idle resource usage, and non-blocking asynchronous I/O (`tokio`).

---

## 2. Hard Technical Problems & Chosen Approaches

### Problem 1: Web Content & Tab Hosting in Tauri v2
- **The Challenge:** Electron exposes `<webview>` HTML tags that allow embedding Chromium browsing contexts directly inside DOM layouts. In Tauri v2, `<webview>` does not exist.
- **Evaluated Options:**
  1. *`<iframe>` embedding:* Broken for modern web browsing due to `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors` enforced by Google, YouTube, GitHub, etc.
  2. *Tauri v2 Child Webviews (`WebviewBuilder`):* Tauri v2 supports creating child webviews attached to the window with specified logical/physical bounds.
  3. *Local Reverse Proxy + Injected Interceptor:* A local loopback HTTP proxy stripping frame restrictions.
- **Chosen Approach:**
  - **Tauri v2 Child Webviews / WebView2 bounds management on Windows**: Web content runs in real, isolated webview instances positioned flush within the browser viewport container.
  - Inactive tabs are hidden by setting size to `0x0` or detaching visibility; sleeping tabs are deallocated.
  - For the homescreen / new-tab view (`neutrino://newtab`), the UI renders internally in the primary Tauri window.

### Problem 2: Adblocker & Request Interception
- **The Challenge:** Electron offers `session.webRequest.onBeforeRequest` to inspect and cancel any network request. Tauri has no standard cross-platform equivalent.
- **Evaluated Options:**
  1. *Brave's native `adblock` Rust crate:* C-speed Bloom filter rule matching with full EasyList and cosmetic filter support.
  2. *Windows WebView2 `WebResourceRequested` filter:* Native hook for intercepting HTTP requests before they hit the wire.
  3. *Cosmetic Filter & Script Injection:* Injected CSS (`display: none !important`) and DOM script observers for YouTube ads.
- **Chosen Approach:**
  - Multi-tiered privacy engine:
    1. **Brave `adblock` crate in Rust:** Evaluates URLs against tracker/ad domain lists and rule sets.
    2. **Script & CSS Injection on Webview Creation:** Injects cosmetic hiding rules and the YouTube ad controller script into every loaded page.
    3. **WebView2 Request Hook (Windows):** Intercepts outbound requests against the engine's block rules.

### Problem 3: Tab Previews & Hover Cards
- **The Challenge:** Electron uses `wc.capturePage()` to grab live bitmap screenshots of web pages.
- **Chosen Approach:**
  - On Windows with WebView2, call `CoreWebView2.CapturePreview` to capture PNG data.
  - When capture is unavailable or the tab is hibernating, gracefully fall back to the **Light/Dark responsive mockup card** with domain pill and favicon dot (preventing the dark card bug fixed in Issue #7).

### Problem 4: Backward Compatibility & Data Migration
- **The Challenge:** Existing users have bookmarks, settings, custom themes, and space configurations in Electron's `%APPDATA%/neutrino` directory.
- **Chosen Approach:**
  - The Rust backend implements an automated, silent importer on initial launch:
    1. Looks for `%APPDATA%/neutrino/storage/state.json` and `settings.json`.
    2. Safely backs up the file before reading.
    3. Deserializes into the Rust `BrowserSettings` and `Space` data structures.
    4. Writes into Tauri's app data directory (`%APPDATA%/com.neutrino.browser`).

---

## 3. Implementation Phases & Progression

```
Phase 0: Bifurcate Repo [COMPLETED]
  ├── Move Electron to electron/ with preserved history
  ├── Root .gitignore & top-level README.md
  └── Verify electron/ build & test passes cleanly
      │
Phase 1: Feature Inventory & Port Plan [CURRENT]
  ├── docs/FEATURE_INVENTORY.md
  └── docs/PORT_PLAN.md
      │
Phase 2: Scaffold Tauri v2 App in rust/
  ├── Cargo workspace in rust/src-tauri
  ├── Tauri v2 configuration (window, permissions, plugins)
  ├── Vite + React frontend in rust/ui (reusing design tokens)
  ├── window.neutrino adapter layer over Tauri invoke/listen
  └── Initial rust/README.md living report
      │
Phase 3: Port Feature by Feature
  ├── Step 1: Settings, presets, and storage persistence (with importer)
  ├── Step 2: Theming (Light/Dark, Space colors, Ambient Glow)
  ├── Step 3: Window framing, sidebar, and Spaces UI (Space switcher)
  ├── Step 4: Tabs & web content hosting
  ├── Step 5: Tab previews / hover cards
  ├── Step 6: Native Adblocker (Brave adblock engine + cosmetic CSS + YouTube skipper)
  ├── Step 7: History, shortcuts, and window controls
  ├── Step 8: Performance & Zen resource management (low-end mode)
  └── Step 9: Packaging & verification
      │
Phase 4: Parity Verification & Benchmarking
  ├── Side-by-side screenshots (docs/parity/)
  ├── Memory, CPU, and startup benchmarks
  └── Final report in rust/README.md
```

---

## 4. Known Bug Prevention Matrix (Electron Bugs Avoided)

The Rust version is engineered from day one to avoid the known issues identified in the Electron version:
1. **Visual artifacts on webpages:** Disabled risky flags (`renderer-process-limit`), no `backdrop-filter` overlap over webviews, and proper opaque backgrounds.
2. **Lag without hardware acceleration:** Lightweight memory footprint, Rust async execution, reduced effects mode enabled automatically on low-spec hardware.
3. **Tab preview stays dark in light theme:** Previews use dynamic CSS variables and `data-theme` overrides from the outset.
4. **Adblocker doesn't work:** Built directly on Brave's native `adblock` Rust engine with live whitelist updates.
5. **Cannot add/switch Space:** Built with strictly validated UUIDs and immutable state transitions in Rust.
6. **Sidebar alignment:** Unified 320px bounding box with standardized padding and margin tokens.
7. **No presets on customizability tab:** Custom theme presets (save, name, load, rename, delete, reset) baked directly into the settings schema and UI.

