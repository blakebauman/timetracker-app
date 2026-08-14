---
name: Time Tracker
description: A soft-toned, red-accented time tracker for consultants billing across clients, projects, and tasks.
colors:
  primary: "oklch(0.588 0.207 27.33)"
  primary-dark: "oklch(0.65 0.207 27.33)"
  bg-light: "oklch(0.988 0.0015 30)"
  bg-dark: "oklch(0.185 0.006 265)"
  surface-light: "oklch(0.995 0.001 30)"
  surface-dark: "oklch(0.228 0.007 265)"
  ink-light: "oklch(0.22 0.006 30)"
  ink-dark: "oklch(0.96 0.003 265)"
  muted-light: "oklch(0.965 0.003 30)"
  muted-dark: "oklch(0.28 0.008 265)"
  border-light: "oklch(0.912 0.004 30)"
  border-dark: "oklch(1 0 0 / 9%)"
  destructive: "oklch(0.577 0.245 27.325)"
  success: "oklch(0.596 0.145 163.225)"
  warning: "oklch(0.666 0.179 58.318)"
typography:
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, SFMono-Regular, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-icon-sm:
    backgroundColor: "transparent"
    rounded: "{rounded.md}"
    size: "32px"
  card:
    backgroundColor: "{colors.surface-light}"
    rounded: "{rounded.xl}"
    padding: "24px"
  badge:
    rounded: "{rounded.full}"
    padding: "2px 8px"
    typography: "{typography.label}"
---

# Design System: Time Tracker

## 1. Overview

**Creative North Star: "The Quiet Ledger"**

Time Tracker is a professional instrument, not a showcase. It exists to be trusted with a number that a client will see on an invoice, so it earns that trust through restraint: a calm, softened neutral ground carries the interface, and the one saturated color — a warm brand red — is spent only where it means something (the running timer, the primary action, a live indicator). Project and tag colors do the rest of the visual work, turning a dense week of client entries into something scannable at a glance without any single element shouting for attention.

The system explicitly rejects the generic SaaS-cream dashboard: no near-white cream body, no gradient-text hero metrics, no tiny uppercase eyebrow above every card, no identical stat-card grids with an orphaned empty cell. It also rejects enterprise-bloat density — Jira/ServiceNow-style overloaded toolbars and 40-field settings screens. Every dense surface (entry lists, detailed reports, many-project workspaces) still resolves cleanly at narrow widths: legends wrap instead of overflowing, stat strips reflow without empty cells.

**Key Characteristics:**
- A softened, warm-neutral ground in both themes — never stark black-and-white, never AI-cream.
- One saturated accent (brand red), spent deliberately: primary actions, the running-timer state, focus rings.
- Project and tag color are the secondary color system, chosen from a hue-alternated palette so adjacent items always read as visually distinct.
- Icon-only actions in dense toolbars, each with an accessible name — labels are reserved for controls that convey current state.
- Flat, layered-by-tone surfaces; elevation comes from a one-step lightness/darkness shift between background and card, not shadow depth.

## 2. Colors

The palette is a warm-neutral ramp (chroma nudged toward the brand's own red hue, not a generic warm/cream default) with one saturated primary and a hue-alternated set of secondary colors for projects and tags.

### Primary
- **Ledger Red** (`oklch(0.588 0.207 27.33)` light / `oklch(0.65 0.207 27.33)` dark): primary buttons, the running-timer indicator and pulse, active nav item, links. Used sparingly — most screens show it in one or two places, never as a background fill.
- **Ledger Red as text** (`--primary-ink`, `oklch(0.5 0.19 27.33)` light / `oklch(0.76 0.19 27.33)` dark): the same brand red retuned for small text. `--primary` is calibrated as a *fill* behind white and fails WCAG AA as 11–12px type (3.59:1 on its own `/10` tint in light, 4.27:1 in dark). `--primary-ink` holds the hue and chroma and moves only lightness. Use it for the active nav label, the running-timer elapsed readout, and the billable indicator — anywhere the brand red is the text rather than the ground.

### Secondary
- **Project & Tag Palette** (18-color hue-alternated set, `worker/lib/colors.ts` `DISTINCT_COLORS` / `react-app/lib/colorUtils.ts`): red, blue, green, amber, violet, teal, pink, lime, indigo, orange, cyan, purple, rose, sky, emerald, yellow, slate, stone — deliberately ordered so consecutive auto-assigned colors alternate warm/cool instead of drifting through a single hue family. Applied to project swatches, tag dots, calendar event blocks (translucent fill + solid left border), and report breakdown legends.

### Tertiary
- **Semantic status** — success (`oklch(0.596 0.145 163.225)`, billable progress / confirmations), warning (`oklch(0.666 0.179 58.318)`, avg/day and caution states), destructive (`oklch(0.577 0.245 27.325)`, delete / discard actions and error states). Each has a paired `-foreground` token for on-color text.

### Neutral
- **Ground** (`oklch(0.988 0.0015 30)` light / `oklch(0.185 0.006 265)` dark): the page background. Warm-tinted off-white in light; soft charcoal with a faint cool tint in dark — never pure white or near-black.
- **Surface** (`oklch(0.995 0.001 30)` light / `oklch(0.228 0.007 265)` dark): cards, popovers, dropdowns — one step lighter (light mode) or one step lighter-than-ground (dark mode) so surfaces read as gently layered.
- **Ink** (`oklch(0.22 0.006 30)` light / `oklch(0.96 0.003 265)` dark): body text, eased off pure black/white for a softer read.
- **Muted** (`oklch(0.965 0.003 30)` light / `oklch(0.28 0.008 265)` dark): secondary surfaces (sidebar, toolbars — a second neutral layer, per product-register convention), disabled fills.
- **Border** (`oklch(0.912 0.004 30)` light / `9% white` dark): input outlines, card edges — always subtle, never a structural color.
- **Border-strong** (`oklch(0.78 0.004 30)` light / `22% white` dark): row dividers in the dense surfaces only (entry list, timesheet grid). The card hairline measures 1.26:1 against the ground, which effectively vanishes across a 30-row list at low vision. This sits at ~2:1 — deliberately short of the 3:1 non-text target, because a 3:1 divider reads as a structural rule and breaks the quiet-ledger feel. Never use it for cards, panels, or inputs.

### Named Rules
**The One Accent Rule.** The brand red appears in at most one or two places on any given screen — the running state and the primary action. It is never used as a large background fill or decoration.

**The Warm-Neutral Rule.** Every neutral token (background, surface, muted, border) carries a slight chroma nudge toward the brand's own red hue (light mode) or a cool 265° tint (dark mode). Neutrals are never chroma-0 gray and never generic cream.

## 3. Typography

**Body Font:** Geist Variable (with `ui-sans-serif, system-ui, sans-serif` fallback)
**Label/Mono Font:** Geist Mono Variable (with `ui-monospace, SFMono-Regular, monospace` fallback)

**Character:** One well-tuned variable sans carries headings, labels, buttons, and body — a second family (Geist Mono) appears only for tabular numbers, durations, and timestamps, where fixed-width digits matter for scannability. Fixed rem scale throughout, not fluid/clamp — this is a product surface viewed at consistent DPI, not a marketing page.

### Hierarchy
- **Title** (600 weight, 20px / `text-xl`, 1.3 line-height): page headings ("Reports", "Settings").
- **Headline** (600 weight, 16px / `text-base`, 1.4 line-height): card titles, section headers.
- **Body** (400 weight, 14px / `text-sm`, 1.5 line-height): default UI text, descriptions, table cells. 65–75ch cap where prose appears (AI summary output); dense tabular data runs narrower.
- **Label** (500 weight, 12px / `text-xs`, 1.3 line-height): muted metadata, timestamps, badge text, form labels.
- **Micro** (500 weight, 10px / `text-micro`): the floor of the ramp, for chrome-level detail only — `kbd` shortcut chips, dense inline badges (entry-row tags, session badges), counts, and micro-metadata inside 16–20px-tall elements. Never for content the user reads as text; anything sentence-shaped belongs at Label or above.
- **Mono/Data** (500 weight, tabular-nums, Geist Mono): durations (`2h 15m`), elapsed timers, currency amounts — anywhere a column of numbers needs to align.

### Named Rules
**The Tabular Rule.** Any number that appears in a list or column (durations, currency, percentages) uses `tabular-nums` so digits align vertically. This is non-negotiable in reports and entry lists.

**The Named-Step Rule.** Every size above comes from a named utility — `text-xl`, `text-base`, `text-sm`, `text-xs`, `text-micro`. An arbitrary size anywhere in the app is drift by definition, even when the pixel value happens to match a step: it can't be changed centrally and it defeats the design-system check. There are now **zero** arbitrary font sizes in the app; keep it that way. (Write sizes in words in Markdown files — Tailwind scans them, and class syntax in prose emits real dead CSS.)

**The Two-Tier Rule.** Where a dense element stacks a heading over its metadata — calendar blocks, table column headers, tool cards, entry rows — the heading is Label (12px) and everything beneath it is Micro (10px). No in-between size: an 11px middle tier is a near-miss that reads as sloppy rather than hierarchical, which is exactly what the app accumulated before this rule existed. The exception is a block whose *only* content is that one line (the calendar's untracked-gap affordance, a `<code>` value you may need to read exactly) — that line is the heading tier, so it takes Label.

## 4. Elevation

The system is flat-by-default with tonal layering, not shadow-driven. Depth is conveyed by a one-step lightness shift between background and surface (card/popover), plus a 1px border — not by drop shadows implying physical height. The timer Start/Stop control is the one place that gets a distinct treatment, and it earns it with *color and motion* rather than dimension: a flat destructive-tinted capsule with a ring breathing outward behind the disc (see §8).

### Shadow Vocabulary
- **Card rest** (`shadow-sm`): the default resting shadow on cards and popovers — barely-there, present mainly to separate a surface from the page on light backgrounds.
- **Overlay** (`shadow-md` / `shadow-lg`): popovers, dialogs and sheets, which float above the page and need to read as detached rather than layered.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest, separated by tone and a hairline border, not by shadow. There is no gradient, inner-shadow or "lit-dome" depth anywhere — including on the timer control, which is a flat solid disc.

## 5. Components

### Buttons
- **Shape:** `rounded-md` (6px) on all sizes.
- **Primary:** brand-red background, white text, `hover:bg-primary/90`, active state scales to 97%.
- **Outline:** transparent background, 1px border, `hover:bg-accent`. The default for secondary toolbar actions.
- **Ghost:** no border or fill at rest; `hover:bg-accent`. Used for tertiary/inline actions (row menus, dismiss buttons).
- **Destructive:** filled with the destructive color; reserved for delete/discard confirmations.
- **Icon-only:** always paired with `aria-label` + a native `title` tooltip. Use the canonical size tokens — `icon-xs` (24px, dense inline row actions), `icon-sm` (32px, toolbar actions — matches labeled `size="sm"` buttons), `icon-lg` (40px) — never an ad-hoc `h-N w-N` override; drift between icon and labeled buttons of the same conceptual size is a defect.

### Badges / Chips
- **Style:** fully rounded (`rounded-full`), 12px label text, 2px/8px padding.
- **Variants:** default (primary fill), secondary (muted fill), outline (border only, transparent fill), destructive.
- **Project/tag chips** additionally carry a small `ColorDot` (2.5px circle) in the item's assigned palette color before the label.

### Cards / Containers
- **Corner Style:** `rounded-xl` (12px).
- **Background:** surface token (one step lighter than page background).
- **Shadow Strategy:** `shadow-sm` at rest (see Elevation); no hover elevation change.
- **Border:** 1px, border token.
- **Internal Padding:** 24px (`py-6` + header/content gutters).
- **The KPI-strip exception:** the Reports summary metrics render as one framed strip (flex-wrap, 1px internal dividers via `bg-border` gaps) rather than a grid of individual cards — this avoids the "identical card grid with an orphaned empty cell" anti-pattern when the visible metric count doesn't evenly divide the row.

### Inputs / Fields
- **Style:** 1px border, `bg-background`, `rounded-md`, `shadow-xs`.
- **Focus:** border shifts to the ring color plus a 3px ring at 50% opacity — no glow, no scale change. **The focus ring is not the brand red.** `--ring` (`oklch(0.55 0.14 265)` light / `oklch(0.7 0.14 265)` dark) is deliberately a different hue from both `--primary` and `--destructive`: when they shared a value, a focused input read as a validation error and "Save changes" was the same color as "Discard". Hue 265 is the system's own cool tint from the dark ramp, not a stock blue. One focus vocabulary everywhere — no bare-underline substitutes.
- **Error:** border and ring shift to the destructive color at reduced opacity.

### Navigation
- **Sidebar:** icon + label nav items, `rounded-md` active/hover states, active item gets a `bg-primary/10` fill with primary-colored text and icon (not a full-color fill — this is the "One Accent Rule" applied to navigation). Collapses to a 56px icon rail; the collapsed state shows the brand mark itself as the expand control (no separate arrow button) — the logo never disappears when collapsed.
- **Tabs** (Reports Summary/Weekly/Detailed, Timer view switcher): segmented control, `bg-muted/40` track, active segment lifts to `bg-background` with a subtle shadow.

### Calendar Event Block (signature component)
Real tracked entries render as a translucent fill (16% opacity of the project/tag color) with a solid left-accent border in the same color — not a solid block, so overlapping context (now-indicator, grid lines) stays legible through it. Three distinct block styles share the same grid: **real entries** (solid border, translucent fill), **unconfirmed calendar "ghost" events** (dashed border, near-transparent, cursor pointer, "click to track" affordance), and **untracked-gap blocks** (dashed, barely-there, "Track hh:mm–hh:mm" label) — all three read as fundamentally different weights of interactivity at a glance without needing a legend.

## 6. Motion

Motion in a quiet ledger is confirmation, not performance. It exists to answer three questions — *did that register?*, *where did this come from?*, and *is this still running?* — and nothing else. Nothing bounces, nothing springs, nothing slides in to be admired.

### Duration Scale

Three steps, defined in `index.css` and consumed as `duration-fast` / `duration-base` / `duration-slow`. Pick by **how far the thing travels**, not by how important it is.

| Token | Value | For |
|---|---|---|
| `duration-fast` | 150ms | A state change in place: hover, focus, colour, a chevron rotating, a row tint. |
| `duration-base` | 200ms | Something appearing or leaving: dialogs, popovers, dropdowns, tooltips, entry rows, stat strips. |
| `duration-slow` | 300ms | A panel-sized move across the screen: sheets and drawers, the timer capsule opening. |

Numeric utilities (`duration-200`) still compile, but the named steps are the convention — they keep the scale greppable and let a retune happen in one place.

### Easing

`--ease-out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`) is **the** curve. Everything decelerating into place uses it; there is no separate "enter" and "exit" curve. `--ease-out-quint` is reserved for the single largest move — the timer control's width change — where a flatter tail keeps a wide element from appearing to overshoot. Looping opacity pulses (`animate-running-dot`) stay on `ease-in-out`, because a symmetric breathe wants a symmetric curve.

Stock `ease-out` / `ease-in-out` / `ease` and Tailwind's default curve are not part of the system. A bare `transition-colors` silently falls back to that default — always pair a transition with a duration and `ease-out-quart`.

### The Running State

The one motion the product is allowed to spend attention on, because "am I still tracking?" is the question the whole app exists to answer. It has **two forms and one cadence** — both loop at 1.6s, so when they share a screen (the sidebar readout sits directly under the timer bar) they breathe together instead of drifting against each other.

- **The signature** (`animate-recording-pulse`): a flat destructive-tinted ring scales outward from behind the Stop disc while the disc itself stays put — the visual equivalent of a recording light. Only ever on that one control. Keeps `ease-out-quart` because it *travels*.
- **The quiet one** (`animate-running-dot`): a small dot breathing in place, for dense surfaces — the sidebar's running readout, a running block on the calendar grid. Opacity only, because these sit inside rows where a scaling dot would nudge its neighbours. On `ease-in-out`, per the curve rule above.

These are the only infinite animations in the product. Adding a third form of "running" is the wrong move — extend one of these two.

### Busy vs. Not-Loaded-Yet

Two different states, two different components, and they are not interchangeable:

- **`Spinner`** (`components/ui/spinner.tsx`) — *this specific action is working*. Sizes are `sm` (14px, compact controls and row actions), `default` (16px, inside a default button), `lg` (20px, a whole panel or route). Never hand-roll `<Loader2 className="animate-spin" />`; that is how five sizes appeared for three jobs.
- **`Skeleton`** — *this surface hasn't loaded yet*. Preferred for anything with a known shape (lists, cards, tables) because it holds the layout instead of collapsing it and then shoving content in.

### Named Rules

**The Confirmation Rule.** Motion confirms something the user did, or reports something that changed. It never decorates, never celebrates, and never delays access to content.

**The One Curve Rule.** `ease-out-quart` unless there is a stated reason otherwise — and the reason belongs in a comment at the call site.

**The Disclosure Rule.** Anything that opens or closes animates its *panel*, not just its chevron. `CollapsibleContent` carries the height animation by default (`duration-base`, `overflow-hidden`); a disclosure whose arrow rotates smoothly while its content snaps into place reads as broken.

**The Reduced-Motion Rule.** `prefers-reduced-motion: reduce` collapses every animation and transition globally (`index.css`). Any effect whose *timing is coordinated in JS* — a row that waits for its exit animation before unmounting, a highlight that clears on a timer — must read the preference too and shorten itself; the CSS rule cannot reach a `setTimeout`. A running state must always survive the preference as colour and iconography, never as motion alone.

## 7. Do's and Don'ts

### Do:
- **Do** keep the brand red to one or two elements per screen — the running-timer state and the primary action (**The One Accent Rule**).
- **Do** use the hue-alternated project/tag palette (`DISTINCT_COLORS`) for anything auto-assigned, so 2-3 adjacent items are never visually near-identical.
- **Do** use `tabular-nums` and Geist Mono for any number in a list or column.
- **Do** use the canonical `icon-xs` / `icon-sm` / `icon-lg` button size tokens for every icon-only button — never a hard-coded `h-N w-N` override.
- **Do** show a real empty state (icon + title + one-line description) on any chart, list, or breakdown that has no data — never a blank axis or silent nothing.
- **Do** let dense legends and stat strips wrap or reflow at narrow widths rather than overflow their container.

### Don't:
- **Don't** use a cream/sand/near-white body background — the "SaaS-cream dashboard" look is explicitly rejected. Neutrals carry a chroma nudge toward the brand's own hue, not a generic warm default.
- **Don't** use gradient-clipped text, tiny uppercase tracked eyebrows above every section, or identical stat-card grids that can orphan an empty cell.
- **Don't** reach for enterprise-bloat density — an overloaded toolbar, a nested-card layout, or a settings screen exposing everything at once. Reveal what the task needs.
- **Don't** add drop-shadow "lift" to cards, menus, or panels on hover — depth comes from tone and border, not shadow.
- **Don't** pair an icon-only button's `size="icon"` with an ad-hoc height/width override; use the size token so it matches its labeled siblings.
- **Don't** visually clone Toggl. Feature parity (calendar view, favorites, auto-track) is a gap-closing strategy — the soft-tone, red-accent identity is this product's own.

## 8. Brand Mark & App Icons

The brand mark is a **circled analog clock reading ~10:10** (the classic "watch ad" angle): a brand-red circle, a white ring at 90% opacity, two rounded white hands, and a center dot. It is the one place the brand red appears as a fill.

**Single source of truth:** `src/shared/brand-mark.ts` — glyph geometry (`clockGlyph`), face ratio, and the pre-converted sRGB hexes of the brand tokens for surfaces that can't use `oklch()` (static assets, email, OG image):

| Token | oklch | hex |
|---|---|---|
| Brand red (light `--primary`) | `oklch(0.588 0.207 27.33)` | `#dd322e` |
| Brand red (dark `--primary`) | `oklch(0.65 0.207 27.33)` | `#f34a42` |
| Ground light | `oklch(0.988 0.0015 30)` | `#fcfbfa` |
| Ground dark | `oklch(0.185 0.006 265)` | `#111315` |

**Two consumers, one geometry:**
- `src/react-app/components/brand/BrandMark.tsx` — the in-app mark (sidebar brand + collapsed-rail expand control, mobile top bar and nav sheet, login/signup). Fills the circle with `var(--primary)` so it tracks the theme.
- `scripts/generate-icons.mjs` (`pnpm generate-icons`) — every static asset: favicon (`logo.svg` + multi-res `favicon.ico`), PWA `any` + `maskable` icons, `apple-touch-icon`, PWA shortcut icons, OG share image, and the extension's four action icons.

**Named rule — One Clock.** No surface may draw its own clock glyph (including lucide's `Clock`) as a brand stand-in. The mark is always the shared geometry; change it in `brand-mark.ts` and re-run `pnpm generate-icons`. The lucide `Timer` icon in the nav is a *navigation* icon, not a brand mark — that distinction is the line.

**Satellite surfaces:** the extension popup consumes the same oklch tokens directly in its inline CSS (Chrome-only surface); transactional email uses the pre-converted hexes via `src/worker/emails/theme.ts` and a deliberately text-only header ("timetracker.run") — no image logo in email, since image blocking would break it.
