# Neutrino Browser

Neutrino is a high-speed, local-first desktop browser featuring Arc-inspired Spaces, interactive tab previews, built-in tracker & ad-blocking, customizable themes & ambient glows, and native MCP intelligence capabilities.

This repository hosts two side-by-side implementations of Neutrino:

1. **`electron/`**: The mature, full-featured reference implementation built on Electron 33, Chromium, React 18, and TypeScript.
2. **`rust/`**: The modern, memory-efficient, resource-conscious implementation built on **Rust** and **Tauri v2**, providing a native OS-backed browser with identical design language and UX.

---

## Repository Structure

```
├── electron/          # Reference Electron implementation
│   ├── src/           # Main process, preload, and React renderer UI
│   ├── tests/         # Unit and integration test suites
│   ├── package.json   # Electron build scripts and dependencies
│   └── README.md      # Electron documentation and architecture notes
├── rust/              # Rust + Tauri v2 implementation
│   ├── src-tauri/     # Rust backend (Tauri v2, webview management, adblock, storage)
│   ├── ui/            # React frontend sharing design tokens with the reference app
│   └── README.md      # Living migration progress report & parity status
├── docs/              # Shared architectural notes, feature inventory, port plan, and parity checks
│   ├── FEATURE_INVENTORY.md   # Exhaustive audit of all browser features and Tauri feasibility
│   └── PORT_PLAN.md           # Step-by-step migration blueprint and technical strategy
└── README.md          # This file
```












# Build Rust release without incrementing version
python build.py --env rust --bump none

# Build Electron and bump minor version (e.g. 0.2.1 -> 0.3.0)
```bash
python build.py --env electron --bump minor

# Build both releases and bump patch version
python build.py --env all --bump patch

# Optional flags:
#   --clean   Clean dist/release folders before building
#   --run     Launch the application immediately after build

# PowerShell wrapper:
.\build.ps1 -env rust -bump none
.\build.ps1 -env electron -bump minor

```










---

## Unified Build & Release System

A master orchestrator script is provided at the repository root (`build.py` and `build.ps1` for PowerShell) to build, increment versions, and stage standalone releases for either or both environments:

```bash
# Build Rust (Tauri v2) release without version bump
python build.py --env rust --bump none

# Build Electron release and bump minor version (0.2.1 -> 0.3.0)
python build.py --env electron --bump minor

# Build both environments and bump patch version
python build.py --env all --bump patch

# PowerShell convenience wrapper
.\build.ps1 -env rust -bump none
.\build.ps1 -env electron -bump minor
```

### Running Release Directory

Build artifacts are staged in the root `release/` directory, allowing side-by-side execution:

```
release/
├── electron/          # Standalone packaged Electron release (Neutrino.exe)
├── rust/              # Standalone compiled Rust/Tauri release (Neutrino.exe)
└── manifest.json      # Metadata tracking current versions, timestamps, and sizes
```

---

## Quick Start

### 1. Electron Reference Implementation (`electron/`)

#### Prerequisites
- Node.js >= 20 (Node v24 recommended)
- npm >= 10

#### Building & Running
```bash
cd electron
npm install
npm run build
npm start
```

#### Running Tests & Packaging
```bash
npm test                # Run Vitest test suites
npm run package         # Package standalone Windows x64 binary to release/
```

---

### 2. Rust + Tauri Implementation (`rust/`)

#### Prerequisites
- Rust >= 1.80 (2021 edition)
- Node.js >= 20 and npm
- Windows: WebView2 Runtime (preinstalled on Windows 10/11) & Visual Studio C++ Build Tools

#### Building & Running
```bash
cd rust
npm install
npm run tauri dev       # Launch desktop app with hot reload
```

#### Packaging
```bash
npm run tauri build     # Compile optimized release binary and installer
```

For detailed migration status, feature parity matrices, benchmark comparisons, and platform limitation notes, refer to [`rust/README.md`](rust/README.md).


