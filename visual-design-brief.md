# Neutrino Browser: Visual Design Brief

Build the most visually appealing browser you can. This document describes how it should look and feel. It is a design brief, not a feature list: all existing functionality (tabs, navigation, URL bar, adblock counter, Zen mode, mode slider, MCP drawer, media player) stays exactly as it works today. Everything below is about presentation.

## The feeling

Neutrino should feel like a **quiet, expensive object**: calm, precise and a little bit cinematic. Think of the inside of a well-designed observatory at night. Nothing shouts. Every surface has depth, every edge is soft, and the whole thing feels carved from one material rather than assembled from widgets.

Three words to design against: **calm, deep, intentional.**

If a choice makes the browser look busier, louder or more "tech product", reject it. If it makes the browser look quieter, more tactile or more considered, keep it.

## Look and material

- **Dark, lunar palette.** Near-black base with a faint cool tint, regolith-gray surfaces, moonlight-warm text (not pure white), and one pale moon-glow accent. A very faint earthshine blue is allowed for tiny secondary details. No neon, no rainbow gradients, no purple-to-pink gradients.
- **Glass with restraint.** The URL bar, floating sidebar, drawer and media player are frosted glass: translucent fill, strong background blur, a hairline light border, and a soft inner highlight on the top edge. Glass is used only on floating things, so the layering makes sense: background art, then glass panels, then content.
- **Depth through light, not borders.** Prefer soft shadows, inner highlights and subtle glows over heavy outlines. Borders are 1px at about 8% white. Focused or active elements get a gentle moon-glow instead of a thick ring.
- **Generous radius, consistent.** Large rounded corners everywhere (12 to 18px for panels, fully rounded for the URL bar and pills). One radius scale, used consistently.
- **Real spacing.** Use an 8px grid. Give things room. Cramped spacing is the fastest way to look cheap.

## The home screen

The home screen is the first impression, so it should feel like a place, not a start page.

- A full-window **ASCII landscape** fills the entire screen behind everything: thin line-art clouds in two depth layers, and one small jet crossing slowly with a faint fading contrail. It is minimal, drawn with light characters, in a muted gray-blue at low opacity, so it reads as texture rather than content. Lots of empty space.
- Over it, a subtle atmosphere: a soft radial moon glow in the upper right and a barely visible grain texture (under 6% opacity) so the dark never looks flat.
- Centered, slightly above middle: a small, elegant serif **"Neutrino"** wordmark with tight letter-spacing, then the **glass URL bar** beneath it. The URL bar is compact (about 42% of window width), fully rounded, with a search icon, a calm placeholder, and a soft glow when focused.
- Bottom-left: the original mode slider, small, no labels, with a tooltip on hover.
- Nothing else. The emptiness is the design.

## Motion

Motion should be **slow, soft and rare.**

- Home background: clouds drift at a pace you only notice if you look away and look back. The jet takes a long time to cross. No twinkling, flicker or jitter. Low frame rate is fine and desirable. Fully static when the user prefers reduced motion.
- UI transitions: 150 to 250ms, ease-out, with slight scale and fade (panels slide in about 12px while fading). The drawer glides in from the right. Tab rows fade and slide gently when added or removed.
- Hover and press: elements lift or brighten by a few percent. Nothing bounces, wobbles or overshoots.
- Focus: a soft glow fades in, never a sudden hard ring.

## Typography

Typography is what separates a designed product from a template.

- **Wordmark and headings:** an elegant serif (Instrument Serif or Fraunces), used sparingly and at larger sizes only.
- **Interface text:** a refined grotesque (Switzer, General Sans or DM Sans) at 13 to 14px, medium weight, slightly tight tracking.
- **Code, tool names, ASCII art:** a quality monospace (JetBrains Mono or IBM Plex Mono).
- Never use Inter, Roboto, Poppins, Plus Jakarta Sans, Space Grotesk or the system default as the main face. Sentence case everywhere, no shouty all-caps labels. Use a clear hierarchy through size and tone (text, muted, faint) rather than lots of bold.

## Components

**Toolbar.** Slim, translucent, flush with the window. Icons are thin-stroke, consistent in weight and size (1.5px stroke), with a soft circular hover state. The adblock and Zen pills are small, calm, softly tinted capsules, not bright badges.

**Floating tab sidebar.** A floating glass panel inset from the window edge, about 280px wide, with generous padding. Tab rows are 40px, with a favicon, a truncated title and a close button that appears on hover. The active tab has a soft moon-glow tint and a fine highlight border. Inactive tabs are quiet muted text. The panel should feel like it is hovering above the page.

**MCP drawer.** A right-hand glass drawer with three tabs: Assistants, Local models, Tools. Assistant cards are large, clean logo tiles with plenty of padding and a soft lift on hover. The tab switcher is a smooth segmented control with a sliding indicator. Chat areas have clear message hierarchy, with calm bubbles, muted timestamps and a floating input with glass styling. Tool rows use the monospace font with small play buttons and a tidy live log.

**Media player.** A compact floating glass card with rounded corners, a thin seek bar with a small glowing thumb, minimal controls, and a soft shadow. It snaps to corners with a smooth ease. It should look like a piece of hardware, not a widget.

**Slider.** Keep the original gradient track and handle. Give the handle a soft glow and a subtle shadow so it feels tactile.

**Scrollbars, tooltips, menus.** Thin, translucent scrollbars that appear on hover. Tooltips are small glass pills. Context menus are glass with hairline separators. Even the smallest details match the rest.

## Details that make it feel premium

- A faint top-edge highlight on every glass panel, like light catching a bevel.
- Consistent shadow system: one small, one medium, one large. Shadows are deep and cool, never gray smudges.
- Icons all come from one family, same stroke and corner style.
- Empty states (no tabs, no local models, no media) have a small line-art illustration or a single elegant line of text, never a blank hole.
- Loading states are calm: a thin shimmer or a slow pulse, never a spinner that spins aggressively.
- Pixel-perfect alignment. Text baselines line up, icons are optically centered, and nothing is off by a pixel.
- The browser chrome stays out of the way. Web content is the star, so when a page is open the interface recedes to a slim, quiet frame.

## What to avoid

- Bright colors, gradients that look like a marketing site, or glow everywhere.
- Heavy borders, flat gray boxes, or default browser form controls.
- Dense, cramped layouts and tiny hit targets.
- Emoji as icons, stock gradient blobs, and generic "AI app" styling.
- Any animation that draws attention to itself.

## Definition of done

- Looks cohesive: it is obvious that one designer made every surface.
- Looks calm: someone can stare at the home screen and relax.
- Looks expensive: depth, blur, spacing and type all feel deliberate.
- Works exactly as before: every existing feature still functions, no layout is broken at 1920x1080, 1366x768 or 1280x720, text meets WCAG AA contrast, there are no console errors, and the UI stays smooth.

Take screenshots at those three sizes when finished, compare them against this brief, and fix anything that falls short before reporting back.
