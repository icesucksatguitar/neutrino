# Neutrino Browser 🛡️⚡

A local-first, high-speed **Chromium-based standalone Windows desktop browser** combining:
- **Brave-Level Ad-Block & Tracker Defense**: Real-time request interception, tracker stripping, cosmetic ad hiding, and Bloom filter domain matching.
- **Zen-Level Low Resource Usage**: Automatic background tab hibernation and memory purging, dropping background tab CPU usage to 0% and freeing RAM.
- **Google Search Engine Integration**: Default search queries, omnibox navigation, start tabs, and new tab shortcuts seamlessly powered by Google Search.
- **Hyper-Customizable Theme Studio (First-Launch & On-Demand)**:
  - Pops up automatically on first launch, or anytime via Sidebar, Omnibox, or `Ctrl+T` / `Ctrl+K`.
  - **Any Color or Gradient in Existence**: Linear gradients (0°-360° angle, multi-stop hex pickers, stop offset sliders), Radial gradients, Mesh gradients, and Solid colors.
  - **12 Curated Aesthetic Presets**: Cyberpunk Neon, Arc Sapphire, Sunset Ember, Emerald Matrix, Sakura Twilight, Glacial Zen, Pitch Black OLED, Solar Amber, Amethyst Royal, Vaporwave Synth, Blood Moon, and Clean Frost (Light).
  - **Typography & Font Customization**: System Default, Inter, Roboto, Segoe UI, JetBrains Mono, Fira Code, Cascadia Code, Georgia Serif, Poppins, plus a custom input field allowing *any* installed font on your machine.
  - **Text Size & Metrics**: Dynamic font size slider (11px to 22px), font weights (400 to 700), and letter spacing sliders.
  - **Glassmorphism & Geometry**: Backdrop blur, sidebar opacity, corner roundness, and accent glow sliders with live real-time browser preview.
- **Arc-Level Workflow**: Collapsible vertical sidebar (`Ctrl+S`), Spaces (Personal, Work, Dev & AI, Research), Pinned favorites, and a floating Command Palette (`Ctrl+T` / `Ctrl+K`).
- **Fully Model Context Protocol (MCP) Capable**: Built-in native JSON-RPC MCP server enabling AI agents (Claude, Antigravity) to inspect active tabs, navigate, query DOM, and execute actions.
- **Easy Local-First Sync**: Local encrypted JSON/SQLite state with export/import sync bundles.
- **Chrome-Level Speed**: Direct Chromium (Blink + V8) multi-process rendering engine with GPU acceleration and zero-copy rasterization.
- **Standalone Windows Executable**: A real `.exe` desktop application (`Neutrino.exe`), not a web app on localhost.

---

## 🏗️ Architecture

```
neutrino/
├── release/Neutrino-win32-x64/
│   └── Neutrino.exe                   # Real Standalone Windows Desktop Browser (188 MB)
├── src/
│   ├── main/                          # Chromium Main Process (TypeScript)
│   │   ├── index.ts                   # Application lifecycle, window creation, flags
│   │   ├── browserManager.ts          # Multi-tab, Spaces & navigation manager
│   │   ├── adblock/
│   │   │   └── engine.ts              # Brave-grade ad-blocking & tracker scrubbing
│   │   ├── resourceManager.ts         # Zen-level background tab hibernation (RAM saver)
│   │   ├── mcp/
│   │   │   └── server.ts              # Model Context Protocol (MCP) JSON-RPC server
│   │   ├── sync/
│   │   │   └── storage.ts             # Local-first encrypted sync & profile storage
│   │   └── preload.ts                 # Secure contextBridge API for UI
│   └── renderer/                      # Arc-Inspired Modern UI (React 18 + TS + Vite)
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx                    # Root UI shell
│       ├── components/
│       │   ├── Sidebar.tsx            # Collapsible vertical sidebar
│       │   ├── WorkspaceSlider.tsx    # Smooth animated workspace track slider (DEFAULT / PLAN / MAX)
│       │   ├── Homescreen.tsx         # Plane homescreen with centered URL typer
│       │   ├── Omnibox.tsx            # HTTPS URL bar, search, shields & zen buttons
│       │   ├── CommandBar.tsx         # Arc-style floating command palette (Ctrl+T/K)
│       │   ├── ThemeCustomizerModal.tsx # First-launch & on-demand theme studio
│       │   ├── HexColorGrid.tsx       # Visual hex color matrix palette selector
│       │   ├── ShieldModal.tsx        # Real-time adblock & tracker stats flyout
│       │   ├── McpModal.tsx           # MCP protocol & tool inspector
│       │   └── BrowserViewport.tsx    # Real Chromium webview & homescreen container
│       ├── hooks/
│       │   └── useBrowser.ts          # Reactive IPC bridge
│       └── styles/
│           └── theme.css              # Glassmorphic, dark/OLED Arc-inspired theme
├── native/                            # Rust High-Speed Privacy Core
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                     # In-memory Bloom filter & URL classifier
│       └── main.rs                    # Standalone CLI binary (neutrino-core.exe)
├── build.py                           # Master Python build, test & packaging CLI
└── tests/
    ├── test_adblock.py                # Tracker interception test suite
    ├── test_mcp.py                    # Model Context Protocol test suite
    └── test_build.py                  # Standalone executable verification suite
```

---

## 🚀 Quick Start

### 1. Launch the Browser (Standalone Executable)
Run the application directly via the Python orchestrator:
```powershell
py build.py run
```
Or open File Explorer and double-click:
`release\Neutrino-win32-x64\Neutrino.exe`

### 2. Build & Package Everything
Recompile Rust core, TypeScript main process, React UI, and package the Windows `.exe`:
```powershell
py build.py package
```

### 3. Run Test Suites
Executes Rust unit tests and Python integration tests (Adblock, MCP, Executable integrity):
```powershell
py build.py test
```

### 4. Check Environment Toolchains
```powershell
py build.py check
```

---

## ⌨️ Arc-Style Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + T` or `Ctrl + K` | **Command Palette** (Open URL, switch tabs, search, trigger commands) |
| `Ctrl + W` | **Close Current Tab** |
| `Ctrl + S` | **Collapse / Expand Sidebar** |
| `Ctrl + 1..4` | **Switch Spaces** (1: Personal, 2: Work, 3: Dev & AI, 4: Research) |
| `Ctrl + R` / `F5` | **Reload Page** |
| `Alt + Left` | **Back** |
| `Alt + Right` | **Forward** |

---

## 🤖 Model Context Protocol (MCP) Tools

Neutrino natively exposes the following tools via MCP JSON-RPC:
- `browser_navigate`: Load any web address in active or target tab.
- `browser_list_tabs`: List all open tabs across spaces with titles, URLs, and states.
- `browser_create_tab`: Open a new tab in any space.
- `browser_close_tab`: Close a tab by ID.
- `browser_get_adblock_stats`: Return real-time tracker blocking stats.
- `browser_zen_optimize`: Hibernate background tabs to purge RAM.
- `browser_get_status`: Return browser engine health and version.

