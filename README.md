# Neutrino Browser 🛡️

A privacy-first, ultra-fast modern desktop browser powered by a hardened **Firefox/Gecko** engine, a native **Rust** privacy and filtering core, a modern **React + TypeScript + Vite** UI shell, and an automated **Python** build and packaging orchestrator.

---

## 🏗️ Architecture Overview

Neutrino combines four high-performance technologies into a modular desktop architecture:

```
+-------------------------------------------------------------------------+
|                         NEUTRINO BROWSER                                |
+-------------------------------------------------------------------------+
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |             FRONTEND UI / UX SHELL (React + TypeScript)          |  |
|  |  * Modern Omnibox & Search Bar       * Shield Protection Flyout   |  |
|  |  * TabStrip (Containers, Audio)      * Real-time Threat Dashboard |  |
|  +-------------------------------------------------------------------+  |
|                                  ▲                                      |
|                                  │ Mozilla Native Messaging (stdio/JSON)|
|                                  ▼                                      |
|  +-------------------------------------------------------------------+  |
|  |             NATIVE PRIVACY & ENGINE CORE (Rust)                   |  |
|  |  * In-memory Tracker Filter Engine   * UTM / Click ID Scrubber    |  |
|  |  * Deterministic Canvas Jitter       * User-Agent Normalization   |  |
|  +-------------------------------------------------------------------+  |
|                                  ▲                                      |
|                                  │ Process Isolation & Profiles         |
|                                  ▼                                      |
|  +-------------------------------------------------------------------+  |
|  |             HARDENED ENGINE RUNTIME (Firefox / Gecko)             |  |
|  |  * Total Cookie Protection (dFPI)    * Telemetry & Normandy Dead  |  |
|  |  * WebRTC IP Leak Neutralization     * DoH (Quad9 / Cloudflare)   |  |
|  +-------------------------------------------------------------------+  |
|                                                                         |
+-------------------------------------------------------------------------+
|  BUILD, PACKAGING & ORCHESTRATION PIPELINE (Python build.py)            |
+-------------------------------------------------------------------------+
```

---

## 🚀 Quick Start & Developer Commands

### 1. Check Toolchain Requirements
Verify that Git, Rust (`cargo`), Node.js (`npm`), and Python are properly installed:
```powershell
py build.py check
```

### 2. Run Comprehensive Test Suites
Executes Rust unit tests, TypeScript type checks, and Python integration tests:
```powershell
py build.py test
```

### 3. Build Production Binaries & UI
Compiles the Rust privacy host in `--release` mode and bundles the React frontend via Vite:
```powershell
py build.py build
```

### 4. Package Standalone Distribution
Assembles all binaries, UI assets, manifests, and profiles into `dist/neutrino-browser/`:
```powershell
py build.py package
```

### 5. Launch Live UI Development
Starts the React UI with hot module reloading (HMR) at `http://localhost:3000`:
```powershell
py build.py dev
```

### 6. Register Native Host & Deploy Hardened Profile
Registers the Native Messaging Host in `HKCU\Software\Mozilla\NativeMessagingHosts\neutrino.host` and deploys the hardened `user.js`:
```powershell
py engine/scripts/setup_profile.py
```

---

## 📂 Repository Structure

```
neutrino/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI pipeline on Windows & Linux
├── .githooks/
│   └── pre-commit               # Pre-commit hook (Cargo check + TS typecheck)
├── .gitignore                   # Multi-language ignore definitions
├── ARCHITECTURE.md              # Deep-dive architectural specification
├── README.md                    # This document
├── build.py                     # Master build and package automation script
├── requirements.txt             # Python build requirements
├── native/                      # Rust privacy & filter engine
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs               # Public library API
│       ├── main.rs              # Native Messaging Host binary (neutrino-host.exe)
│       ├── filter/              # Fast domain pattern matching & threat categorization
│       ├── privacy/             # Canvas noise injector & UTM parameter scrubber
│       └── ipc/                 # 32-bit length-prefixed stdio JSON protocol
├── engine/                      # Firefox engine profiles & patches
│   ├── config/
│   │   ├── mozconfig.win64      # Mozilla source build flags for Windows
│   │   ├── policies.json        # Enterprise policy lockdown (Zero Telemetry)
│   │   └── user.js              # Hardened Arkenfox/Tor standard profile preferences
│   ├── manifests/
│   │   └── neutrino_host.json   # Native Messaging registration manifest
│   ├── patches/                 # Source patch diffs for Gecko engine
│   └── scripts/
│       └── setup_profile.py     # Registry registration & profile bootstrapper
├── ui/                          # Modern React + TypeScript + Vite UI shell
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx              # Main browser shell
│       ├── components/          # NavigationBar, TabStrip, ShieldModal, Viewport
│       ├── hooks/               # useNativeBridge (IPC communication)
│       └── types/               # TypeScript data models
└── tests/                       # Integration test suites
    ├── test_build.py            # Integrity tests for policies, user.js, and binaries
    └── test_privacy_filter.py   # Live IPC communication tests with neutrino-host.exe
```

---

## 🔒 Privacy & Security Features

* **Zero Mozilla Telemetry**: All Normandy, Studies, Health Reports, Crash pings, and telemetry servers are neutralized at both preference and network layers.
* **Total Cookie Protection (dFPI)**: Cookies and local storage are partitioned per top-level origin, rendering cross-site user tracking impossible.
* **Deterministic Canvas Jitter**: Generates subtle domain-keyed noise offsets so canvas hashes change between websites while staying stable within a single domain.
* **WebRTC Leak Defense**: Disables ICE candidate enumeration to eliminate real local and VPN public IP leakage.
* **Encrypted DNS (DoH)**: Locked to Quad9 / Cloudflare DNS-over-HTTPS preventing ISP eavesdropping.
* **Link Parameter Sanitizer**: Strips `utm_*`, `fbclid`, `gclid`, and affiliate tracking tokens automatically before navigation.

---

## 📜 License

MIT License - Designed for personal customization and local high-performance privacy browsing.

