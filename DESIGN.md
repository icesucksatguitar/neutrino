# Neutrino Browser — Radical Minimalism UI/UX Specification (DESIGN.md)

> **Design Brief:** Radical minimalism. The web page is the product and the browser chrome should almost not exist.  
> Inspired by: **Arc's ambition**, **Things 3's restraint**, **macOS Notification Center's physicality**, and **Teenage Engineering's confidence**.  
> Target Canvas: **1440 × 900 Desktop**, dark mode primary with light mode variant.

---

## 1. Core Concept: "The Tabs Are Notifications"

Traditional browser chrome (heavy toolbars, horizontal tab strips, permanent sidebars) divides user attention and shrinks the web canvas. In Neutrino:
- **When idle, the browser is only the web page, edge-to-edge**, framed by smooth 12px rounded window corners.
- The only persistent chrome in idle state is a tiny **floating URL pill at top center**, displaying only the domain name (e.g. `linear.app`) in 13px medium text.
- Tabs exist not as a static row or panel, but as **physical floating notification cards** along the left edge.

---

## 2. The Hero Tab System

### A. Collapsed State (Hairline Markers)
- Positioned flush along the **left window edge**, vertically centered.
- Consists of **2px-wide, 24px-tall vertical hairline markers**, spaced with 6px gaps.
- Active tab marker is extended to 36px and illuminated in **electric ultraviolet (`#7C5CFF`)** with a gentle starlight glow.
- **Zero background or rail container** behind the markers.

### B. Trigger & Motion Physics
- **Trigger:** Hovering within the left 8px of the window or pressing **`Cmd+E`** (`Ctrl+E` on Windows).
- **Physics:** Spring animation (**stiffness 380, damping 30**, ~220ms total duration).
- Each card drops in with a **30ms cascade stagger**.

### C. Expanded State (Notification Center Physicality)
- Tabs appear as floating cards stacked identically to macOS notifications.
- **Card Dimensions:** `280px × 56px`, `14px` corner radius.
- **Material:** Translucent frosted glass (`backdrop-filter: blur(24px)`, `background: rgba(255, 255, 255, 0.06)`, `border: 1px solid rgba(255, 255, 255, 0.12)`, `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35)`).
- **Card Anatomy:** 20px favicon, 1-line truncated page title (13px medium `#F2F2F3`), and domain below (11px muted `#8A8A90`).
- **Active Card:** Features a **2px electric ultraviolet (`#7C5CFF`) left accent edge** and a faint starlight glow.
- **Close Affordance:** A small `×` icon softly fades in on the right on hover.
- **Pinned Tabs:** Represented as **56px × 56px favicon-only square cards** with 14px radius at the top of the stack.
- **Hover Fan-Out:** On hover, the stack dynamically expands with 8px vertical spacing between cards.
- **Swipe-to-Dismiss:** Dragging a card to the left initiates a rubber-band tilt; releasing past the threshold dismisses the tab and triggers a floating **Undo toast** (`Ctrl+Z` / `Cmd+Z` to restore).
- **Memory Sleep State:** Tabs idle for extended periods dim to 55% opacity and scale down to 0.98 to signal zero RAM consumption.
- **Spaces / Groups:** Collapsible notification group card showing a colored status dot, workspace name, and count badge (e.g. `Research · 7`).

---

## 3. Command Bar (Cmd+K / Cmd+L)

- **Dimensions:** Centered floating frosted pill, `640px` wide, `52px` tall, `16px` radius.
- **Backdrop:** Dims the web page underneath with a soft `rgba(0,0,0,0.55)` blur.
- **Input Field:** Unified input handling URLs, web searches, active tab switching, and commands. Features an electric ultraviolet caret.
- **Inline Right Hints:** `Tab to search tabs`, `↵ to go` in 11px muted monospace text.
- **Results List:** Clean list with no horizontal dividers. Keyboard selection highlighted with `rgba(124, 92, 255, 0.16)` and ultraviolet left accent.
  - Open tabs display live favicons.
  - Executable actions are prefixed with `>` (e.g. `> Toggle Dark / Light Theme`).

---

## 4. New Tab Page

- **Canvas:** Ultra-clean near-black field (`#0A0A0B`) with subtle procedural grain at 3% opacity.
- **Clock:** Single large clock (`88px`, thin weight, `font-variant-numeric: tabular-nums`).
- **Prompt:** Centered `480px` floating pill with `Where to?` placeholder opening the Command Bar.
- **Shortcuts:** Exactly 6 small (`44px × 44px`) favicon-only floating square cards with 12px radius.

---

## 5. Split View

- Seamless multi-pane division with **1px hairline** (`rgba(255, 255, 255, 0.12)`).
- Panes feature **8px rounded corners** with a **6px gap**.
- Draggable floating pill handle centered on the divider that illuminates with an ultraviolet glow on hover.

---

## 6. Visual Language & Design Tokens

| Token | Dark Mode | Light Mode | Description |
| :--- | :--- | :--- | :--- |
| **`--bg`** | `#0A0A0B` | `#FAFAFA` | Canvas base |
| **`--surface-glass`** | `rgba(255, 255, 255, 0.06)` | `rgba(255, 255, 255, 0.85)` | 24px frosted glass |
| **`--hairline`** | `rgba(255, 255, 255, 0.12)` | `rgba(0, 0, 0, 0.08)` | 1px border lines |
| **`--text`** | `#F2F2F3` | `#111113` | Primary typography |
| **`--text-muted`** | `#8A8A90` | `#6B7280` | Secondary / metadata |
| **`--accent`** | `#7C5CFF` | `#7C5CFF` | Electric ultraviolet |
| **`--accent-glow`** | `0 0 20px rgba(124,92,255,0.35)` | `0 0 16px rgba(124,92,255,0.25)` | Active glow |

### Typography & Radii
- **Font:** `Inter Display` / system sans-serif.
- **Sizes:** 11px (hints/badges), 13px (body/tabs/URL), 15px (command bar input/headings).
- **Weights:** 400 (Regular), 500 (Medium).
- **Radii:** 12px window, 14px cards, 16px pills, 8px split panes.
- **Grid:** 4px baseline grid.

---

## 7. Generated High-Resolution Design Screens (1440 × 900)

The 8 required design screens have been rendered at native 1440 × 900 resolution:

1. **Screen 1 — Idle Browsing (Radical Minimalism)**: Edge-to-edge web content with top floating URL pill (`linear.app`) and left collapsed hairline markers.
2. **Screen 2 — Tabs Expanded (Notification Stack)**: 7 notification tab cards, 1 active card with ultraviolet accent, 1 pinned card, 1 group card.
3. **Screen 3 — Tab Stack Fan-Out & Swipe-to-Dismiss**: Hover fan-out state with rubber-band swipe gesture and floating Undo toast.
4. **Screen 4 — Minimalist Command Bar**: 640px frosted glass pill with live tab matches, history, and command actions.
5. **Screen 5 — New Tab Page**: Near-black `#0A0A0B` field with large thin clock, "Where to?" pill, and 6 shortcuts.
6. **Screen 6 — Split View**: Dual panes with 1px hairline, 8px corners, 6px gap, and draggable pill handle.
7. **Screen 7 — Light Mode Variant**: Pristine `#FAFAFA` palette with dark jet typography and violet accents.
8. **Screen 8 — Design System Component Sheet**: Complete interactive state catalog (cards, pills, markers, handles, and swatches).
