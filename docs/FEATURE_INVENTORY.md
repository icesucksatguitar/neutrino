# Neutrino Feature Inventory & Tauri Feasibility Audit

This document provides a comprehensive technical audit of the reference Electron implementation of **Neutrino** and establishes the feasibility, architecture, and translation plan for porting to **Rust + Tauri v2**.

---

## 1. Technical Stack Overview (Electron Reference)

- **Electron Version:** `33.2.0` (Chromium `130.0.6723.137`, Node.js `20.18.0`, V8 `13.0`)
- **Node Runtime Environment:** Node.js `>= 20` (tested on Node `v24.18.0`)
- **Build Tooling:**
  - Frontend: `Vite 6.1.0` with `@vitejs/plugin-react 4.3.4` (ES2022, bundler module resolution)
  - Main Process: `TypeScript 5.7.3` (`tsc -p tsconfig.main.json` emitting CommonJS to `dist-main/`)
  - Preload Scripts: `tsc -p tsconfig.preload.json`
  - Packaging: `electron-packager 17.1.2` targeting `win32-x64`
- **UI Framework & Design Tokens:**
  - `React 18.3.1` with `react-dom 18.3.1`
  - Icons: `lucide-react 1.16.0` and custom pixel art SVGs
  - Typography: Anthropic Sans, Claude Serif, Instrument Serif, Outfit, Fira Sans, Pixelify Sans, Silkscreen, Fraunces
  - Styling: Pure CSS Variables with dynamic CSS custom properties injected on `:root`, glassmorphism, ambient canvas glows
- **How Tabs Are Hosted:**
  - Embedded `<webview>` HTML elements in `BrowserViewport.tsx` running with `webviewTag: true`.
  - Guest `WebContents` are created out-of-process in Chromium.
  - Profile isolation is achieved using session partitions (`partition="persist:profile-<id>"`).
  - Webview nodes are unmounted when tabs enter deep sleep (`isSleeping: true`) to reclaim memory.

---

## 2. Feature Inventory by Functional Area

### 2.1 Tabs & Navigation
| Feature | Electron Mechanism | Tauri Feasibility | Technical Notes & Translation Approach |
| :--- | :--- | :--- | :--- |
| **Tab Creation / Deletion** | Main-process `BrowserManager` state map + `<webview>` tag creation | **Direct** | Rust state manages tab metadata (`TabState`); frontend renders UI and invokes Tauri commands. |
| **Tab Web Content Hosting** | Embedded Chromium `<webview>` tags with `src` | **Workaround** | Tauri has no HTML `<webview>`. Solved via Tauri v2 multi-webview child webviews attached to window coordinates, or an embedded proxy/iframe architecture for sandbox-safe rendering. |
| **Navigation Controls (Back / Forward / Reload / Stop)** | Preload `webContents` wrappers: `canGoBack()`, `goBack()`, `reload()` | **Direct** | Tauri Webview methods `eval("history.back()")` or native WebView2 `GoBack()`, `GoForward()`, `Reload()`. |
| **URL Navigation & Omnibox** | User input converted to URL or search engine query (Google, DuckDuckGo, Brave, Ecosia) | **Direct** | Pure logic handled in React or Rust; triggers webview navigation. |
| **Tab Switching & Active State** | CSS display toggle (`block` / `none`) + focus transfer | **Direct** | Show active child webview, position bounds flush with viewport, hide inactive webviews. |
| **Tab Reordering** | Drag-and-drop tab list with order updates in `BrowserManager` | **Direct** | State handled in React and persisted in Rust. |
| **Tab Sleeping / Hibernation** | `ZenResourceManager` marks tabs sleeping after 10m inactivity; unmounts `<webview>` DOM nodes | **Direct** | Rust timer or frontend timer sets `isSleeping = true`, child webview is destroyed or hidden, preserving URL and scroll offset. |
| **Zoom Factor Controls** | `webContents.setZoomFactor(factor)` on guest webview | **Direct** | WebView2 `put_ZoomFactor` or CSS `document.body.style.zoom`. |
| **Audio / Media Playing Badge** | `media-started-playing` and `media-paused` guest events | **Workaround** | Script injected via `initialization_script` tracking HTML5 `<video>` / `<audio>` playback and emitting Tauri events. |
| **Find in Page** | `webContents.findInPage(query)` and `stopFindInPage()` | **Workaround** | Script injection with DOM `window.find()` or WebView2 native Find API. |

### 2.2 Spaces & Profiles
| Feature | Electron Mechanism | Tauri Feasibility | Technical Notes & Translation Approach |
| :--- | :--- | :--- | :--- |
| **Multiple Spaces (Study, Work, Leisure, Custom)** | `BrowserManager` spaces array with unique ID, color, icon, name | **Direct** | Rust `Space` struct with `serde`, full parity with JSON schema. |
| **Space Creation, Rename, Delete** | IPC `neutrino:create-space`, `update-space`, `delete-space` | **Direct** | Tauri commands with identical payload shapes and validation. |
| **Space Isolation** | Tabs are filtered by `spaceId`; active tab is remembered per Space | **Direct** | Pure state logic mirrored in Rust backend and React frontend. |
| **Session Profiles** | Chromium partitions (`persist:profile-<id>`) with separate cookies/storage | **Limited** | WebView2 supports `CoreWebView2Profile` with separate user data folders; on WebKitGTK / WKWebView, partition separation requires distinct data directories. |
| **Bottom Space Switcher** | Draggable and clickable horizontal slider with feathered overflow and add button | **Direct** | Pure CSS & React components; identical rendering. |

### 2.3 Theming & Visual Customization
| Feature | Electron Mechanism | Tauri Feasibility | Technical Notes & Translation Approach |
| :--- | :--- | :--- | :--- |
| **Light & Dark Mode** | `nativeTheme.themeSource` + `data-theme="dark"` / `"light"` on `<html>` | **Direct** | Native window theme synced with OS, `data-theme` attribute on document root. |
| **Dynamic Space Themes** | CSS variables for background gradient stops, surface colors, text contrast | **Direct** | 100% portable CSS token system (`applySpaceTheme.ts`). |
| **Ambient Glow Engine** | Dynamic CSS radial gradients with animation speed, blur, intensity, styles (`theme`, `prism`, `custom`, `off`) | **Direct** | Pure CSS/Canvas in React. |
| **Theme Studio & Presets** | Preset save, name, load, rename, delete, reset to default | **Direct** | Backed by Rust settings persistence and React custom presets UI. |

### 2.4 Tab Previews & Hover Cards
| Feature | Electron Mechanism | Tauri Feasibility | Technical Notes & Translation Approach |
| :--- | :--- | :--- | :--- |
| **Hover Preview Cards** | Left hover dock showing active and inactive tab cards with close button and title | **Direct** | React UI component (`TabPreviewCard.tsx`, `NotificationTabs.tsx`). |
| **Live Thumbnail Capture** | `webContents.capturePage()` returns `NativeImage` converted to base64 JPEG | **Workaround** | Windows: `CoreWebView2.CapturePreview` to stream/file; Fallback: Mockup card skeleton with domain pill and favicon. |
| **Top Bar Tint Sampling** | Canvas 1px sample of webpage top strip for subtle top chrome tinting | **Workaround** | Injected script samples `document.body` or canvas screenshot in Rust. |

### 2.5 Adblocker & Privacy Shields
| Feature | Electron Mechanism | Tauri Feasibility | Technical Notes & Translation Approach |
| :--- | :--- | :--- | :--- |
| **Domain Request Interception** | `session.defaultSession.webRequest.onBeforeRequest` with `checkRequest()` | **Workaround** | Windows: WebView2 `WebResourceRequested` filter or local filtering HTTP proxy; Rust `adblock` crate handles filter matching at wire speed. |
| **Cosmetic Filter Injection** | `contents.insertCSS(adblockEngine.getCosmeticFilterCSS())` | **Direct** | Tauri `add_script` / `eval` or CSS injection via DOM on page load. |
| **YouTube Ad Controller** | `adblockEngine.getYouTubeAdSkipperScript()` injected on YouTube pages | **Direct** | Injected JavaScript script executed on document load on YouTube domains. |
| **Site Whitelist** | In-memory `Set` synced with `shieldWhitelist` settings array | **Direct** | Rust state manages whitelist; checked before filtering requests. |
| **Shield Statistics** | Counters for total, ads, trackers, analytics, fingerprinters, data saved | **Direct** | Rust `ShieldStats` struct emitted via Tauri events. |

### 2.6 Performance, Low-End PC & Resource Management
| Feature | Electron Mechanism | Tauri Feasibility | Technical Notes & Translation Approach |
| :--- | :--- | :--- | :--- |
| **Tab Memory Freeing** | Unmounts `<webview>` elements when tabs sleep | **Direct** | Destroy or hide child webviews when tabs sleep. |
| **Memory Trimming** | `webFrame.clearCache()` on memory-pressure / idle | **Workaround** | WebView2 `MemoryUsageTargetLevel.Low` via COM interface or Windows working set trim. |
| **Reduced Effects Mode** | Auto-enables when software GPU detected; disables blurs, grain, and glow animations | **Direct** | CSS `data-reduced-effects="on"` token overrides; auto-detected in Rust backend. |
| **Background Throttling** | `contents.setBackgroundThrottling(true)` | **Direct** | Default behavior in WebView2 for background tabs/frames. |

### 2.7 Password Manager & Security
| Feature | Electron Mechanism | Tauri Feasibility | Technical Notes & Translation Approach |
| :--- | :--- | :--- | :--- |
| **DPAPI Key Encryption** | Windows `CryptProtectData` / `CryptUnprotectData` via `electron/native` | **Direct** | Native Rust crate directly calls Win32 Cryptography APIs via `windows` crate. |
| **Windows Hello Biometrics** | Windows WinRT `UserConsentVerifier` | **Direct** | Native Rust calls `windows::Security::Credentials::UI::UserConsentVerifier`. |
| **Vault Storage** | Encrypted JSON/SQLite credentials storage | **Direct** | Rust `rusqlite` or encrypted JSON file in `%APPDATA%/Neutrino`. |
| **CSV Import & Chrome Import** | Parsing Google Chrome / Edge SQLite login databases | **Direct** | Rust SQLite parser with DPAPI key unwrapping. |

### 2.8 Built-in VPN / Proxy Tunnel
| Feature | Electron Mechanism | Tauri Feasibility | Technical Notes & Translation Approach |
| :--- | :--- | :--- | :--- |
| **Proxy Tunneling** | Electron `session.setProxy()` | **Workaround** | WebView2 `--proxy-server` launch arguments or `CoreWebView2EnvironmentOptions`. |
| **WebRTC IP Leak Protection** | `session.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')` | **Workaround** | Command line flags passed to WebView2 environment. |
| **DNS-over-HTTPS (DoH)** | Built-in DoH client resolving upstream DNS via Cloudflare/Google DoH | **Direct** | Rust `reqwest` / `hickory-dns` client. |

### 2.9 Model Context Protocol (MCP)
| Feature | Electron Mechanism | Tauri Feasibility | Technical Notes & Translation Approach |
| :--- | :--- | :--- | :--- |
| **JSON-RPC Server** | `mcp/server.ts` listening for local tools execution | **Direct** | Native Rust async JSON-RPC 2.0 dispatcher (`tokio` + `serde_json`). |
| **Browser Tool Execution** | Navigate, click, list tabs, screenshot | **Direct** | Rust calls Tauri webview evaluate script / inspect state. |

---

## 3. Exhaustive IPC Channel Matrix

| IPC Channel Name | Direction | Payload Shape | Electron Caller(s) | Tauri Equivalent |
| :--- | :--- | :--- | :--- | :--- |
| `neutrino:get-state` | Renderer → Main | `void` | `useBrowser.ts` | `get_browser_state` |
| `neutrino:navigate` | Renderer → Main | `string` (url) | `Omnibox.tsx`, `BrowserViewport.tsx` | `navigate_tab` |
| `neutrino:go-back` | Renderer → Main | `void` | `FloatingUrlPill.tsx` | `go_back` |
| `neutrino:go-forward` | Renderer → Main | `void` | `FloatingUrlPill.tsx` | `go_forward` |
| `neutrino:reload` | Renderer → Main | `void` | `FloatingUrlPill.tsx` | `reload_tab` |
| `neutrino:create-tab` | Renderer → Main | `{ url?, spaceId? }` | `App.tsx`, `useBrowser.ts` | `create_tab` |
| `neutrino:close-tab` | Renderer → Main | `string` (tabId) | `NotificationTabs.tsx`, `Sidebar.tsx` | `close_tab` |
| `neutrino:select-tab` | Renderer → Main | `string` (tabId) | `NotificationTabs.tsx`, `BrowserViewport.tsx` | `select_tab` |
| `neutrino:toggle-pin-tab` | Renderer → Main | `string` (tabId) | `NotificationTabs.tsx` | `toggle_pin_tab` |
| `neutrino:toggle-sleep-tab` | Renderer → Main | `string` (tabId) | `NotificationTabs.tsx`, `BrowserViewport.tsx` | `toggle_sleep_tab` |
| `neutrino:select-space` | Renderer → Main | `string` (spaceId) | `NotificationTabs.tsx`, `Sidebar.tsx` | `select_space` |
| `neutrino:create-space` | Renderer → Main | `{ name, color?, profileId? }` | `NotificationTabs.tsx` | `create_space` |
| `neutrino:delete-space` | Renderer → Main | `string` (spaceId) | `NotificationTabs.tsx` | `delete_space` |
| `neutrino:update-space` | Renderer → Main | `{ spaceId, patch }` | `useProfiles.ts` | `update_space` |
| `neutrino:reorder-space` | Renderer → Main | `{ spaceId, toIndex }` | `WorkspaceSlider.tsx` | `reorder_space` |
| `neutrino:toggle-shields` | Renderer → Main | `void` | `ShieldModal.tsx` | `toggle_shields` |
| `neutrino:toggle-site-whitelist`| Renderer → Main | `string` (domain) | `ShieldModal.tsx` | `toggle_site_whitelist` |
| `neutrino:reset-shield-stats` | Renderer → Main | `void` | `ShieldModal.tsx` | `reset_shield_stats` |
| `neutrino:get-shield-stats` | Renderer → Main | `void` | `ShieldModal.tsx` | `get_shield_stats` |
| `neutrino:get-settings` | Renderer → Main | `void` | `useSettings.ts` | `get_settings` |
| `neutrino:update-settings` | Renderer → Main | `Partial<BrowserSettings>`| `useSettings.ts` | `update_settings` |
| `neutrino:get-performance-status` | Renderer → Main | `void` | `App.tsx`, `SettingsPanel.tsx` | `get_performance_status` |
| `neutrino:capture-tab-preview-by-id`| Renderer → Main | `string` (tabId) | `NotificationTabs.tsx` | `capture_tab_preview` |
| `neutrino:get-tab-preview` | Renderer → Main | `string` (tabId) | `NotificationTabs.tsx` | `get_tab_preview` |
| `neutrino:window-control` | Renderer → Main | `'minimize'\|'maximize'\|'close'` | Window titlebar controls | `window_control` |
| `neutrino:get-history` | Renderer → Main | `HistoryQueryOptions` | `HistoryModal.tsx` | `get_history` |
| `neutrino:clear-history` | Renderer → Main | `'hour'\|'day'\|'all'` | `HistoryModal.tsx` | `clear_history` |
| `neutrino:delete-history-entry`| Renderer → Main | `{ id?, url?, timestamp? }` | `HistoryModal.tsx` | `delete_history_entry` |
| `neutrino:get-vpn-status` | Renderer → Main | `void` | `VpnModal.tsx` | `get_vpn_status` |
| `neutrino:connect-vpn` | Renderer → Main | `Partial<VpnConfig>` | `VpnModal.tsx` | `connect_vpn` |
| `neutrino:disconnect-vpn` | Renderer → Main | `void` | `VpnModal.tsx` | `disconnect_vpn` |
| `neutrino:check-vpn-ip` | Renderer → Main | `void` | `VpnModal.tsx` | `check_vpn_ip` |
| `neutrino:mcp-call` | Renderer → Main | `{ method, params }` | `McpModal.tsx` | `mcp_call` |
| `neutrino:passwords-status`| Renderer → Main | `void` | `PasswordsSettings.tsx` | `passwords_status` |
| `neutrino:passwords-list` | Renderer → Main | `void` | `PasswordsSettings.tsx` | `passwords_list` |
| `neutrino:passwords-reveal` | Renderer → Main | `string` (id) | `PasswordsSettings.tsx` | `passwords_reveal` |
| `neutrino:passwords-copy` | Renderer → Main | `string` (id) | `PasswordsSettings.tsx` | `passwords_copy` |
| `neutrino:passwords-delete` | Renderer → Main | `string` (id) | `PasswordsSettings.tsx` | `passwords_delete` |

### Reverse Events (Main → Renderer)
- `neutrino:state-update` → Emitted on every tab, space, or shield change.
- `neutrino:tracker-blocked` → Emitted whenever a tracker request is blocked.
- `neutrino:settings-updated` → Emitted when settings or custom presets are saved.
- `neutrino:performance-updated` → Emitted when GPU or reduced effects mode changes.
- `neutrino:history-updated` → Emitted when navigation logs new history item.
- `neutrino:vpn-status-updated` → Emitted on VPN connection state change.
- `neutrino:password-prompt` → Emitted when a webview detects a submitted login credential.

---

## 4. Electron APIs Used & Tauri Translation Mapping

| Electron API | Used For | Tauri Translation |
| :--- | :--- | :--- |
| `app.commandLine.appendSwitch` | Hardware acceleration flags, GPU switches, color profile | Tauri builder `.additional_browser_args()` on WebView2 |
| `BrowserWindow` | Frameless window, transparent/vibrant background, drag regions | `tauri::window::WindowBuilder` (`decorations(false)`, `transparent(true)`) |
| `webContents.capturePage` | Live tab thumbnails | WebView2 `CapturePreview` or fallback mockup skeleton |
| `session.webRequest.onBeforeRequest` | Adblock tracker blocking | WebView2 `WebResourceRequested` filter or embedded Rust proxy |
| `webContents.insertCSS` | Cosmetic adblock CSS | `webview.eval()` injecting `<style>` or WebView2 `add_script_to_execute_on_document_created` |
| `webContents.executeJavaScript`| YouTube ad skipper, trackpad swipe detection | `webview.eval()` or initialization script |
| `Menu.setApplicationMenu` | Application menu bar | `tauri::menu::Menu` |
| `clipboard.writeText` | Copying password / auth links | `tauri-plugin-clipboard-manager` or `arboard` crate |
| `shell.openExternal` | Opening URLs in default browser | `tauri-plugin-opener` or `open::that` |
| `nativeTheme.themeSource` | Syncing dark/light mode with OS | `tauri::window::Window::set_theme` |
| `ipcMain` / `ipcRenderer` | Two-way communication | Tauri `#[tauri::command]` and `window.emit()` |

