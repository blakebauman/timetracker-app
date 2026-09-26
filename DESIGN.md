---
name: Time Tracker
description: A true-neutral instrument rack with one lit control — a red-accented time tracker for consultants billing across clients, projects, and tasks.
colors:
  primary: "oklch(0.588 0.207 27.33)"
  primary-dark: "oklch(0.65 0.207 27.33)"
  primary-foreground: "oklch(1 0 0)"
  primary-foreground-dark: "oklch(0.13 0 0)"
  primary-ink-light: "oklch(0.485 0.19 27.33)"
  primary-ink-dark: "oklch(0.76 0.19 27.33)"
  ground-light: "oklch(0.961 0 0)"
  ground-dark: "oklch(0.168 0 0)"
  card-light: "oklch(0.976 0 0)"
  card-dark: "oklch(0.191 0 0)"
  popover-light: "oklch(0.985 0 0)"
  popover-dark: "oklch(0.215 0 0)"
  rail-light: "oklch(0.943 0 0)"
  rail-dark: "oklch(0.145 0 0)"
  ink-light: "oklch(0.15 0 0)"
  ink-dark: "oklch(0.961 0 0)"
  muted-light: "oklch(0.925 0 0)"
  muted-dark: "oklch(0.239 0 0)"
  muted-ink-light: "oklch(0.51 0 0)"
  muted-ink-dark: "oklch(0.68 0 0)"
  accent-light: "oklch(0.91 0 0)"
  accent-dark: "oklch(0.27 0 0)"
  border-light: "oklch(0.888 0 0)"
  border-dark: "oklch(1 0 0 / 9%)"
  border-strong-light: "oklch(0.8 0 0)"
  border-strong-dark: "oklch(1 0 0 / 20%)"
  ring-light: "oklch(0.55 0.14 265)"
  ring-dark: "oklch(0.7 0.14 265)"
  glass-light: "oklch(0.976 0 0 / 72%)"
  glass-dark: "oklch(0.191 0 0 / 70%)"
  destructive: "oklch(0.45 0.19 18)"
  destructive-dark: "oklch(0.72 0.17 12)"
  success: "oklch(0.596 0.145 163.225)"
  success-ink-light: "oklch(0.45 0.145 163.225)"
  success-dark: "oklch(0.696 0.17 162.48)"
  warning: "oklch(0.666 0.179 58.318)"
  warning-ink-light: "oklch(0.49 0.179 58.318)"
  warning-dark: "oklch(0.769 0.188 70.08)"
  chart-ink-soft-light: "oklch(0.84 0 0)"
  chart-ink-soft-dark: "oklch(0.40 0 0)"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  readout:
    fontFamily: "Geist Mono Variable, ui-monospace, SFMono-Regular, monospace"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.33
    fontVariation: "tabular-nums"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  subtitle:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1
  headline:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33
  micro:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, SFMono-Regular, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
    fontVariation: "tabular-nums"
rounded:
  sm: "4px"
  md: "6px"
  base: "8px"
  xl: "12px"
  container: "12px"
  capsule: "32px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  rail: "80px"
  pane-gutter: "24px"
  row-gap: "8px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, var(--primary) 90%, transparent)"
  button-outline:
    backgroundColor: "{colors.ground-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.full}"
    padding: "0 14px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  button-icon-xs:
    rounded: "{rounded.full}"
    size: "24px"
  button-icon-sm:
    rounded: "{rounded.full}"
    size: "32px"
  button-icon-lg:
    rounded: "{rounded.full}"
    size: "40px"
  input:
    backgroundColor: "{colors.ground-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.full}"
    padding: "4px 16px"
    height: "36px"
  textarea:
    backgroundColor: "{colors.ground-light}"
    rounded: "{rounded.container}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.card-light}"
    rounded: "{rounded.container}"
    padding: "24px"
  row-card:
    backgroundColor: "{colors.card-light}"
    rounded: "{rounded.container}"
    padding: "10px 16px"
  badge:
    rounded: "{rounded.full}"
    padding: "2px 8px"
    typography: "{typography.label}"
  segment-track:
    backgroundColor: "{colors.muted-light}"
    rounded: "{rounded.full}"
    padding: "3px"
    height: "32px"
  segment-active:
    backgroundColor: "{colors.ground-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.full}"
    padding: "0 12px"
  composer:
    backgroundColor: "{colors.glass-light}"
    rounded: "{rounded.capsule}"
    padding: "12px"
    width: "736px"
  rail-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink-light}"
    rounded: "{rounded.full}"
    size: "48px"
  rail-button-active:
    backgroundColor: "color-mix(in oklab, var(--foreground) 6%, transparent)"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.full}"
    size: "48px"
  kbd:
    backgroundColor: "{colors.muted-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: "20px"
    typography: "{typography.micro}"
  tab-line-active:
    backgroundColor: "transparent"
    textColor: "{colors.ink-light}"
    padding: "8px 16px"
---

# Design System: Time Tracker

## Overview

**Creative North Star: "The Instrument Rack"**

Time Tracker is a rack of instruments, not a dashboard. The chassis is a true-neutral ramp with no tint anywhere — a near-black ground in dark, a light grey in light — and the panels sit in it with one hairline edge each. Navigation is an 80px icon rail on the left; every route is a tall pane whose header floats over a scroll-fade and whose content scrolls without a scrollbar. The thing you *do* (start tracking) is a glass capsule hovering over the bottom of the pane, and the thing that is *happening* (a running timer) docks to the bottom edge as a full-width transport bar with a live trace of the day. One saturated colour, the brand red, is the only lit control on the rack: the Start disc and its glow, the elapsed readout, the running segment and now-line, the active rail ring, the header's one primary pill, the Settings underline. Project and tag swatches do the at-a-glance scanning; nothing else on the page carries hue.

The register is precise, calm and unobtrusive: a consultant mid-task should never lose a billable minute and never wonder "am I still tracking?". The system refuses the category default of a top toolbar with a text field and a play button, refuses the SaaS card-grid page, and refuses the cream/tinted-charcoal ground of the generic AI dashboard — the neutrals here are chroma-zero by measurement, not by mood. Density is welcome where the job is dense (a thirty-row day, a timesheet grid) and is earned by resolving cleanly at every width: on a phone the rail becomes a chassis strip with a sheet, the composer spans the bottom edge with 16px insets, and every control stays on screen.

**Key Characteristics:**
- A chroma-zero neutral ramp in both themes: ground, card, popover and rail are four measured lightness steps, never a tint.
- One accent (brand red) spent as a light, not a fill: the Start disc glows, the running readout reads in it, the active rail button wears a fading ring of it.
- Every structural line is one device pixel — the hairline draws panel edges, inputs, row cards and the segment track; there is no 2px border anywhere.
- Controls are pills, panels are 12px-cornered, the composer alone is a 2rem capsule; radius is chosen by what a thing *is*.
- No scrollbars: a gradient from the ground fades content out beneath each pane's floating header instead.
- Geist for everything, Geist Mono for every duration, clock and column of figures, always tabular.
- Motion is one scale (150/200/300ms) and one curve, with one exception reserved for the capsule docking into the bar.

## Colors

A chroma-zero neutral ramp in both themes with a single saturated primary, three text-calibrated ink variants, a cool focus hue that belongs to nothing else, and an eighteen-swatch project/tag palette.

### Primary
- **Brand Red** (`--primary`, `{colors.primary}` light / `{colors.primary-dark}` dark): the Start disc and its glow, the primary pill in a pane header, the active rail ring (at 60% opacity, masked to fade downward), the running segment and now-line on the day ribbon, the calendar's now-indicator, the Settings underline, the selected row card's edge (at 50%) and wash (at 5%), the assistant's nudge count. Text selection is the red at 28%. It is never a large background fill — the calendar's today column is a 4% wash of the *foreground*, not of the red, for exactly that reason.
- **`--primary-foreground` is pure white in light** (`{colors.primary-foreground}`), not the near-white ink: on the brand red, 0.985 measures 4.40:1 and fails AA on every primary button label; white measures 4.59:1. In dark the fill is brighter and takes near-black ink (`{colors.primary-foreground-dark}`).
- **Brand Red as text** (`--primary-ink`, `{colors.primary-ink-light}` light / `{colors.primary-ink-dark}` dark): the elapsed readout in the docked bar, the billable "$" on a row (the *toggle* in the composer and bar is not red — "on" is a recessed pill in full ink, so the bar keeps one lit control), links, the hover colour of an editable description or duration. `--primary` is calibrated as a *fill behind white* and fails AA as small type; this holds hue and chroma and moves lightness only. Light is L 0.485, not 0.5: on the accent surface plus its own 10% tint the older value measured 4.43:1 (`e2e/contrast.spec.ts`).

### Secondary
- **Project & Tag Palette** (18 hex swatches, `worker/lib/colors.ts`, mirrored in `react-app/lib/colorUtils.ts`): blue, amber, green, violet, pink, teal, orange, indigo, lime, cyan, purple, yellow, sky, red, emerald, rose, slate, stone (auto-assign order). `DISTINCT_COLORS` is hue-*alternated* (warm/cool/warm) so two or three auto-assigned projects never come out near-identical, and it keeps red and rose deep in the order: they sit within a few degrees of the brand red, and a first project born red made its finished ribbon segments indistinguishable from the live one; `TAG_COLORS` is the same set in hue order for the manual picker grid. Applied to project dots, the project badge tint, calendar blocks (translucent fill with a 3px solid left edge), the header's "Logged" proportion bar, the day ribbon's segments, and report legends. Projects created without a colour get the first unused `DISTINCT_COLORS` entry server-side.
- **Swatch ink is derived, never copied.** A label drawn on a tint of its own swatch mixes the swatch toward `--foreground` by `--swatch-ink-mix` (46% light / 55% dark) over a 13% tint of the swatch; one expression fixes both themes for eighteen arbitrary hexes.

### Tertiary
- **Destructive** (`{colors.destructive}` light / `{colors.destructive-dark}` dark) is a *different* red from the brand: 9 degrees off the hue and materially darker in light, brighter with a bigger hue step in dark (a deep red disappears on near-black). Light measures 7.97:1 as a label; the dark fill takes near-black ink because near-white on it measured 2.69:1. It belongs to Discard, Delete and error states — never to Stop, which *saves* the entry and wears the brand red like Start.
- **Success** (`{colors.success}` light / `{colors.success-dark}` dark) and **Warning** (`{colors.warning}` light / `{colors.warning-dark}` dark) are calibrated as fills. As *text* they use `--success-ink` (`{colors.success-ink-light}` light; same as the fill in dark) and `--warning-ink` (`{colors.warning-ink-light}` light; same as the fill in dark) — hue and chroma held, lightness moved, for the same measured reason as `--primary-ink`. Icon-only uses stay on the fill token; icons need 3:1 and clear it.
- **Chart marks** encode *billable*, not category: bar charts stack `--success` (the part you invoice) under `--chart-ink-soft` (`{colors.chart-ink-soft-light}` light / `{colors.chart-ink-soft-dark}` dark), which must stay distinguishable from success on luminance alone. There is no `--chart-1..5`; categorical colour is always the project palette.

### Neutral
- **Ground** (`--background`, `{colors.ground-light}` light / `{colors.ground-dark}` dark): the page. Light grey, not white; near-black (a 6% grey), not black. Chroma zero in both.
- **Card** (`--card`, `{colors.card-light}` light / `{colors.card-dark}` dark): a panel on the rack — one step *lighter* than the ground in both themes, with a hairline edge. Cards, row cards, the Settings panels.
- **Popover** (`--popover`, `{colors.popover-light}` light / `{colors.popover-dark}` dark): a further step up for dialogs, sheets, popovers, menus and selects — the lightest surface in each theme, so an overlay reads as floating above the panels rather than as one of them.
- **Rail** (`--rail`, `{colors.rail-light}` light / `{colors.rail-dark}` dark): a step *down* from the ground. The chassis the panels sit in: the icon rail on desktop, the brand strip on a phone. The darkest thing on screen in dark mode.
- **Ink** (`--foreground`, `{colors.ink-light}` light / `{colors.ink-dark}` dark): 15% black in light, 96% white in dark — eased off pure in both directions.
- **Muted** (`--muted`, `{colors.muted-light}` light / `{colors.muted-dark}` dark): the segment track, the day ribbon's trace track, the "Logged" proportion track, kbd chips, secondary fills. `--secondary` is the same value.
- **Muted ink** (`--muted-foreground`, `{colors.muted-ink-light}` light / `{colors.muted-ink-dark}` dark) is tuned against the *worst* ground it lands on — the segment track and the rail, not the page. L 0.51 clears AA on all of them in light: ground 5.13 / card 5.36 / muted 4.60 / rail 4.85. Dark's 0.68 measures 6.6:1 on the ground and 5.7:1 on the track.
- **Accent** (`{colors.accent-light}` light / `{colors.accent-dark}` dark): hover and keyboard-focus fills inside menus and on outline/ghost buttons.
- **The hairline** (`--border`, `{colors.border-light}` light / `{colors.border-dark}` dark): every panel edge, every input, every row card, the segment track, the rail's right edge, the docked bar's top edge. One device pixel, one value. `--input` is the same value in light and 12% white in dark.
- **Border-strong** (`{colors.border-strong-light}` light / `{colors.border-strong-dark}` dark): row dividers inside a dense grid (timesheet, planner), the day ribbon's hour ticks, and the *hover* edge of a row card. Never for panels or inputs.
- **Glass** (`--glass`, `{colors.glass-light}` light / `{colors.glass-dark}` dark): the card colour at partial opacity behind a 24px blur with 1.2 saturation. Exactly two surfaces are made of it — the composer and the docked bar — declared as one token so they cannot drift into two hand-tuned alphas.

### Named Rules
**The One Lit Control Rule.** The brand red is a light, not a paint. It appears on the thing you press (the Start disc), the thing that is happening (the readout, the ribbon's live segment, the rail's running dot), the one primary pill in a header, and the active rail ring — and on nothing decorative. If a new surface wants the red as a wash or a large fill, it is wrong.

**The True-Neutral Rule.** Every neutral token — ground, card, popover, rail, muted, border — is chroma zero in both themes. The brand red and the project swatches are the only hue on the page. A tinted grey, a cream, a cool charcoal: all drift.

**The Two Reds Rule.** Running is `--primary`; destroying is `--destructive`; they separate on lightness as well as hue so that a 1.5px progress bar can tell "3% into budget" from "110% through it". In the docked bar the red belongs to Stop (which saves) and the readout; the Discard button beside them is the only thing that wears the destructive colour.

**Suggestions** (the description combobox): the keyboard selection — the row Enter commits — is the solid `--accent`; a hovered row is only a 5% ink wash. On a running timer the typed text is a search while the list shows and is saved only once it closes; Escape with the list closed restores the saved description. Continue (resume-last) wears a history clock, never the counter-clockwise arrow, which belongs to Keep running.

**Toasts** sit on `--popover` whatever their kind: `richColors` is mapped (`ui/sonner.tsx`) so success, warning and error read through their `-ink` token and a hairline tinted toward the hue, and info is the neutral toast with an icon — no cream, mint or blue surfaces. Every stop receipt shares one toast id, so a new stop replaces the last and Keep running closes it.

**The Derived-Ink Rule.** Any colour that has to be read as *text* is a separate token from the same colour as a *fill* — `--primary-ink`, `--success-ink`, `--warning-ink` — holding hue and chroma and moving lightness until it clears AA on its worst ground. Never put the fill token on small type.

**The Focus Hue Rule.** `--ring` (`{colors.ring-light}` light / `{colors.ring-dark}` dark) is hue 265 — deliberately neither the brand red nor the destructive red, so a focused field never reads as a validation error and "Save" never looks like "Discard". Lightness is set per theme so the ring clears 3:1 on every ground. One focus vocabulary everywhere: the border shifts to the ring colour and a 3px ring at 50% opacity appears; the composer's bare field, which has no border to shift, uses an inset ring at full opacity instead.

## Typography

**Display Font:** Geist Variable (with ui-sans-serif, system-ui, sans-serif fallback)
**Body Font:** Geist Variable
**Label/Mono Font:** Geist Mono Variable (with ui-monospace, SFMono-Regular, monospace fallback)

**Character:** One variable sans carries titles, labels, buttons and body; the mono appears wherever a number has to hold a column — durations, clocks, the elapsed readout, the ribbon's hour labels — and always with tabular figures. The scale is fixed rem steps, not fluid: this is a product surface at consistent DPI, not a marketing page. Weight does the ranking above 14px; contrast does it below.

### Hierarchy
- **Display** (700, 24px, tight tracking at -0.025em): the pane title — "Sep 14 – 20 · W38", "Projects", "Settings" — set inline with its actions in the floating header. Also the login page's product name.
- **Readout** (Geist Mono, 600, 24px, tabular): the docked bar's elapsed time, in `--primary-ink`. The one number in the app at Display size; it is the answer to "am I still tracking?" and is sized to be read from across a desk.
- **Title** (600, 20px): the auth card's heading ("Welcome back, clock-watcher") and error-page headings. Not used inside panes — the pane title is Display.
- **Subtitle** (600, 18px, line-height 1): dialog and alert-dialog titles.
- **Headline** (600, 16px, line-height 1): card titles ("Appearance", "Keyboard shortcuts"), sheet titles.
- **Body** (400, 14px): default UI text, row descriptions, table cells, buttons, segments, form labels (at 500), day-group headers (at 600). Inputs render at 16px below the tablet breakpoint so iOS does not zoom, and 14px above it.
- **Label** (500, 12px): the "Logged this week" strip, the row's time range (mono, tabular), the ribbon's hour labels and the readout's "since 09:02" (mono, tabular), the composer's day summary, badges, card descriptions, secondary metadata, the assistant's shortcut hints.
- **Micro** (500, 10px, `--text-micro`): the floor of the ramp, for chrome-level detail only — kbd chips, the billable "$", entry-row tag chips, the rail's nudge count, the "Showing 5 days" chip, the spent-figure caption. Never for anything sentence-shaped. Deliberately declared without a line-height so call sites inherit their leading.
- **Mono/Data** (Geist Mono, tabular): durations ("1h 30m"), time ranges ("13:00 – 14:30"), day totals, currency — at Body or Label size, and at Readout size in the bar.

### Named Rules
**The Tabular Rule.** Any number that appears in a list, column or readout uses tabular figures and the mono face, so digits align vertically and a control's width does not depend on which digits it holds. The row's time range is fixed-width per format (12h is genuinely wider) and right-justified for the same reason. Non-negotiable in the entry list, reports and the bar. It applies to *columns* — the breakdown tables, the timesheet and planner grids, client stats, the spent-figure caption; a headline figure set at the Title or Display step (a KPI value, the week total beside the pane title) stays in the sans with tabular figures, because the mono has no named step above Body outside the docked bar's Readout.

**The Named-Step Rule.** Every size above is a named step; an arbitrary font size anywhere in the app is drift by definition, even when its pixel value happens to match a step. ESLint fails the build on one (`packages/eslint-config/base.js`). This rule had been swept clean by hand more than once and grew back each time, because nothing failed when it did. (Never write a utility class name in backticks in a Markdown file — Tailwind v4 scans `.md` and compiles what it sees into the shipped stylesheet. Name the CSS property or the token instead.)

**The Spent-Figure Rule.** A "5h 30m / 90h" caption beside a progress bar ranks by *contrast*, not size: the spent value is `--foreground`, the thing it is measured against is `--muted-foreground`, and both stay at Micro. One component, `ui/spent-figure.tsx`, so the three surfaces that render this pair cannot diverge again.

**The One-Keycap Rule.** Every keyboard chip is `ui/kbd.tsx` — `Kbd`, or `KbdGroup` for a sequence. The chip is 20px tall at Micro in the mono face, on `--muted` with a hairline and a 4px corner; a longer label may widen its padding and nothing else varies. Inside a tooltip's inverted surface it re-inks itself from `--background` at 20%.

**The Two-Tier Rule.** Where a dense element stacks a heading over its metadata — calendar blocks, table column headers, tool cards, the spent-figure caption — the heading is Label and everything beneath it is Micro. No 11px middle tier.

## Layout

The app is a fixed rack: the page never scrolls, the panes do. The shell is a full-height row — an 80px rail on the left (`--spacing-rail`), then the pane column, capped at 1800px and centred. Nothing on the page has a scrollbar in either engine; each scrolling pane fades its content out at the top instead.

**The rail** is 80px wide, on `--rail`, with a hairline right edge and 20px vertical padding. The brand mark (36px) sits in a 48px slot at the top, then the six route buttons (48px circles, 8px apart), then at the bottom: Assistant, Search, and the account avatar. Below the tablet breakpoint (768px) the rail becomes a 56px chassis strip across the top — mark, product name, Assistant and a menu button — and the nav lives in a 288px left sheet as fully rounded rows.

**The pane** (`components/layout/Pane.tsx`) is the one shape every route is built from: a relative, full-height column with hidden overflow. Its header is *absolute* over the top — 24px side gutters, 20px above, 8px below, wrapping with 12px/8px gaps — and measures itself into `--pane-header-h` (default 4.5rem) so a header that wraps to two rows at a narrow width pushes the content down rather than covering its first row. A gradient from `--background` to transparent, the header's height plus 20px tall, sits at the sticky tier beneath it; the scroll region pads its top by `--pane-header-h` and its sides and bottom by 24px. A body that manages its own scrolling (the calendar grid, the timesheet) opts out of the padding but still starts below the header. The Timer's header carries a second row — the "Logged this week" proportion strip — inside the same floating header, so the list fades out beneath both.

**The dock clearance.** The shell exposes `--dock-h` — 8.5rem while the composer floats (24px up, roughly 104px tall) and 6.5rem while the bar is docked (88px flush) — and the main region pads its bottom by it, transitioning at the slow duration, so the last row of any route clears the timer surface. Toasts offset 112px from the bottom on desktop for the same reason; on a phone the composer spans the bottom edge, so toasts drop in from the top instead, 72px down to clear the brand strip.

**Density and rhythm.** The base rhythm is 4px; the working steps are 8 (row gap, rail button gap), 12 (header gap, composer padding, row card horizontal gap), 16 (row card side padding, phone insets), 24 (pane gutters, card padding, the composer's inset from the rail and the bottom edge). Entry rows are row cards 8px apart under a plain day header; Settings caps its panels at 768px. Breakpoints are Tailwind's: 640 (sm — the row's time range moves into the metadata line below it), 768 (md — the rail appears, the composer stops spanning the edge), 1024 (lg — the day ribbon appears in the bar, Split view is offered), 1280 (xl — the ribbon widens from 256 to 320px).

**Touch and hover** are gated on input capability, not viewport width: hit areas grow to 44px on a coarse pointer — through a centred pseudo-element (`.tt-touch`, or the icon-size `Button`s' own), never by growing the box, so a phone's chips stay 32px and its bars don't reflow; only form fields, which can't host one, take a min-height — and reveal-on-hover row actions are always visible on a device that cannot hover.

## Elevation & Depth

Depth on the rack is tonal and drawn: a panel is one lightness step up from the ground with a one-pixel hairline, and that is the whole vocabulary for everything that rests on the page. There is no resting shadow on a card, a row, an input or a button. Shadows are spent on the things that are genuinely *off* the page — overlays, and the two timer surfaces — plus one red glow.

### Shadow Vocabulary
- **Overlay** (Tailwind's medium shadow on popovers, menus and selects; large on dialogs, sheets and submenus): floating surfaces, always paired with `--popover` so "floating" is said twice in one voice. The assistant's scroll-to-latest button and the skip-to-content link, both of which hover over content, take the medium shadow.
- **The composer** (Tailwind's 2xl shadow): the idle capsule is the loudest surface in the app and the only thing at that depth. Its edge is the brand red at 20% and stays there on focus — the field's own ring is the one focus signal.
- **The lit disc** (large shadow, coloured `--primary` at 40%, 50% on hover): the composer's 40px Start disc and the assistant's Send disc — a glow, not a drop. The only coloured shadows in the system. Running, the Stop disc drops the glow and the pulse ring does that job.
- **The active rail button** (large shadow): the current route's 48px circle lifts a step off the chassis, under its fading red ring.
- **The active segment** (small shadow): the recessed pill on the segment track carries the faintest lift so it reads as *set into* the track rather than painted on it.
- **The brand glow** (dark only): three stacked drop-shadows of the brand red at 55/35/20% behind the rail's mark — the one place the red is a light rather than a fill. Off in light, where a glow on a light ground reads as a smudge.

### Named Rules
**The Hairline Rule.** Every structural line is one device pixel of `--border`. There is no 2px border anywhere in the world; the only thicker lines are the calendar's 3px event edge and 2px now-indicator, which are colour, not structure.

**The Flat-At-Rest Rule.** Surfaces that rest on the page — cards, row cards, inputs, buttons, the segment track — are separated by tone and hairline alone. A shadow means "this is off the page": an overlay, the composer, or the lit disc.

**The Glass Rule.** Exactly two surfaces are glass — the composer and the docked bar — and both are `--glass` behind a 24px blur. Nothing else blurs.

## Shapes

Radius is chosen by what an element *is*, never by taste, and there are four families; the boundary between them is density.

- **Controls are pills** (fully rounded): buttons of every size — icon-only buttons are therefore circles — badges, inputs, select triggers, the segment track and its segments, the composer's chips, the rail's 48px buttons, the sheet nav's rows, the header's split Add pill.
- **Containers are 12px** (`--radius-container`, 0.75rem): cards, row cards, dialogs, sheets (on their open edge), popovers, menus, selects, textareas. Tight-cornered, not pillowy — a rack panel, not a cushion.
- **The capsule is 2rem** (`--radius-capsule`): exactly one surface, the floating composer. It is the loudest shape in the system and it is spent on the one thing the app exists to do.
- **Data cells stay at the base scale** (`--radius`, 8px, and its 6px/4px steps): timesheet and planner cells, calendar blocks (4px with a 3px solid left edge), menu items (8px), the elapsed-readout hit area, kbd chips (4px), the row checkbox.

Borders are hairlines (see Elevation). A dashed hairline means exactly one thing — **empty, click to fill**: the assign-project chip, the calendar's ghost, gap and draft blocks, empty-state containers. It is never a "you can't" signal; locked cells read at 50% opacity with a not-allowed cursor and stay in the tab order.

## Components

### Buttons
- **Shape:** fully rounded at every size. Heights: xs 24px, sm 32px, default 36px, lg 40px; icon-only circles at xs 24px, sm 32px, default 36px, lg 40px. Text is Body at 500; xs drops to Label.
- **Every button carries a transparent 1px border** with background clipped to the padding box. It is load-bearing: focus sets a border *colour*, and without a border width the focus border never rendered. It also keeps the box identical between variants.
- **Primary:** `--primary` fill, `--primary-foreground` text, 90% on hover. The pane header's Add control is a primary pill split in two (Add, then a caret for "Add with AI…") with a 25% white divider — the header's one red element.
- **Outline:** `--background` fill with the hairline; hovers to `--accent`. The default for secondary toolbar actions ("Today", "Draft day").
- **Ghost:** no fill at rest; hovers to `--accent` (50% in dark). Row menus, period steppers, dismiss buttons, the docked bar's Discard (which hovers to `--destructive`).
- **Destructive:** `--destructive` fill; delete and discard confirmations only.
- **Link:** `--primary` text with an underline on hover.
- **States:** hover and focus at the fast duration; press scales to 97% except on menu triggers (a trigger that shrinks while its menu opens reads as two animations on one click); an open menu trigger holds its hover fill via `aria-expanded`; disabled is 50% opacity.
- **Icon-only** buttons always carry an accessible name and a native title, and use the size tokens — never an ad-hoc width/height — so they match labelled siblings of the same size. Prefer icon-only in dense toolbars; keep the label when the button conveys current state (date range, rounding mode). On a coarse pointer every icon size reaches a 44px hit area through a pseudo-element; the box itself never grows, so a 24px control in a 32px track stays a 24px control.

### The Segment Track
One shape for every "pick one of these" control: a 32px track on `--muted` with a hairline and 3px padding; segments are pills at Body 500 with 12px side padding. The **active segment is recessed** — `--background` fill, a hairline edge and the small shadow — so it reads as set into the track, in ink, not in the brand red. Inactive segments are `--muted-foreground` and brighten to `--foreground` on hover. On a phone the track scrolls horizontally rather than wrapping labels mid-word.

Five controls render this exact shape and must not diverge: `SegmentedControl` (a value — theme, time format), `Tabs` in its default variant (Reports' Summary / Weekly / Detailed), `TaskViewTabs`, `TimerViewSwitcher`, and the calendar-view radiogroup inside `CalendarViewOptions`. They share the exported `SEGMENT_TRACK` / `SEGMENT` / `SEGMENT_ACTIVE` / `SEGMENT_INACTIVE` strings from `ui/segmented-control.tsx`; a sixth consumer imports those rather than restating them.

### Line Tabs
`Tabs` in its `line` variant is the Settings navigation: a hairline under the whole strip, triggers at Body 500 with 16px/8px padding, and the active tab carries a 1px `--primary` underline sitting *on* the strip's hairline (pulled down one pixel so the two coincide). It is the only place the accent appears as a line, and it is spent on the one navigation that is itself a page. The active tab lives in the query string so a Settings section is linkable.

### Cards & Row Cards
- **Card:** `--card` fill, 12px corners, hairline edge, 24px padding, 24px internal gap; header and content share a 24px gutter. Card titles are Headline. No shadow, no hover lift.
- **Row card** (the entry row): the same panel at list density — `--card`, 12px corners, hairline, 16px side and 10px vertical padding, 12px gap between cells, rows 8px apart. Hover wakes the *edge* (to `--border-strong`), not the fill; the fill is reserved for selection (`--primary` at 5% with a 50% red edge) and the just-stopped flash. Inside a description group's card, occurrences are hairline-separated rows instead, hovering to a 40% muted wash. Cells, left to right: project dot, description over a metadata line (project badge, tags at Micro), sync state, the billable "$" in `--primary-ink` at Micro, the mono time range at Label, the mono duration at Body, and reveal-on-hover actions.
- **Day header:** a plain heading row — chevron, Body 600 label, mono muted total — with no fill of its own; a tinted band above a stack of cards read as a second, heavier card.
- **The KPI strip:** Reports' summary metrics are one framed, wrapping strip with hairline internal dividers, not a grid of cards that can orphan an empty cell.

### Inputs / Fields
- **Style:** a recessed well — `--background` fill (one step *below* the card it sits on), hairline in `--input`, fully rounded, 36px tall, 16px side padding so text clears the curve. No shadow.
- **Select trigger:** the same well at 12px side padding (it is fit-width in tight toolbars and the extra 8px truncated values); the chevron gives it the room the pill needs. 36px, or 32px in its small size.
- **Textarea** is the deliberate shape exception: 12px container corners, because a pill forces the first and last lines of multi-line text into the curve.
- **Focus:** border to `--ring`, 3px ring at 50%. **Error:** border and ring to `--destructive` at reduced opacity. **Disabled:** 50% opacity.
- **Inline editors** in a row (description, duration) are bare fields with a `--primary` bottom hairline while editing, and turn destructive when the value is invalid rather than silently reverting.

### The Composer (signature)
The idle timer. A glass capsule (`--glass`, 24px blur) with 2rem corners, 12px padding, a `--primary` edge at 20% and the 2xl shadow, fixed 24px up from the bottom edge (plus the safe-area inset) and 24px in from the rail, at most 46rem wide (16px insets and full width on a phone). The edge does not brighten on focus: the field's ring is the one focus signal. Row one: a *bare* description field — no border, transparent, 36px, Body-size at every width, placeholder "What are you working on?", ellipsis on overflow, focus as an inset full-opacity ring — then, once something is typed and the field is focused (fine pointer, sm and up), a quiet "Enter to start" kbd hint, beside the 40px `--primary` Start disc with its red glow, which scales to 105% on hover. The billable toggle sits in row one, right after the field — whether an hour is invoiceable is a property of the work described, and at the end of a wrapping chip row it kept falling onto a line of its own. For ten seconds after any stop, and only while the field is empty, a neutral outline **Keep running** pill (Alt+Shift+R) sits beside the disc — the undo lives where Stop was pressed, not only in a toast across the screen. Row two: chips — project, task, tag pills (32px, hairline, `--background`, hovering to a 6% ink wash; plus a tag picker chip — an icon beside the tag pills, carrying the count below xl where the pills fold away — that adds, lists and removes), the billable toggle — and, right-aligned, the day summary (a compact ribbon from lg, today's total in mono, and "· 42m untracked" when the last stop was five or more minutes ago), resume-last and favourites. An unassigned project chip takes a dashed `--warning` edge, `--warning-ink` and the visible label "Add project" once there's a description to bill, with the reason as its accessible description. DOM order is field → chips → Start (a two-column grid puts the disc back at top right), so Tab follows describe → assign → start. Until the page has heard whether a timer is running, the disc holds a Spinner and is `aria-busy`: a press is held, with its instant, and applied only if nothing turns out to be running (the bar adopts a running entry from the entries list as soon as it arrives). The day summary is a Skeleton meanwhile — unknown is never drawn as idle or as zero. The compact ribbon's now-line is `--foreground` at 40%, not red: the composer is a resting surface with one lit control. It enters with the capsule-in motion. It is the only surface at its depth, the only capsule, and one of two glass surfaces.

### The Docked Transport Bar (signature)
The running timer. The capsule docks into a full-width glass strip on the bottom edge (from the rail's right edge on desktop, edge to edge on a phone) with a hairline top and no radius, entering with the dock-in motion. While today's entries load, the full ribbon is a Skeleton track labelled "Loading today", never an empty day; its hour labels fall on the clock's multiples of three. Inside, capped at 1800px with 16/24px side and 12px vertical padding: the 40px Stop disc — brand red, shadow off, a flat `--primary` ring breathing outward behind it — then the Readout (24px mono 600, `--primary-ink`, in a fixed 8ch box its editor shares so editing never shifts the row, click to edit in place) over the start time ("since 09:02", Label mono, muted, click to type a clock time; a cloud-off glyph beside it while writes are queued), the same bare description field (now at 500, with a 4% ink hover wash so it reads as editable; Enter commits it and never stops the timer) and the same chips, the day ribbon (from lg, flexing between 12 and 28rem beside a description column capped at 42rem, so no band of empty glass opens up at wide widths), and a ghost Discard button that hovers to `--destructive`. The description column takes `basis-0`: it absorbs the leftover width and wraps its own chips rather than pushing Discard onto a row of its own. Below the tablet breakpoint the readout and Discard share the first row, the field (with the billable toggle) takes the second, and the chips the third on one line, the project chip truncating — ending in the Stop disc, bottom-right, where a right thumb rests (the disc beside the readout is hidden there); the bottom padding adds the safe-area inset. The bar publishes its rendered height as `--timer-h`, which panes pad by. On every Start and Stop, keyboard focus is carried to the equivalent control in the other body and a polite live region says what happened.

### The Day Ribbon (signature)
Today as a trace, inside the docked bar: a 36px-tall strip, 256px wide (320 from the desktop breakpoint). Hour ticks in `--border-strong` (8px tall every third hour, 4px otherwise) with Micro mono labels; beneath them an 8px fully rounded track on `--muted` carrying one segment per entry in its project colour (minimum 2px wide), the running segment in `--primary` breathing with the running-dot cadence, and a 1px `--primary` now-line overshooting the track by 4px. The window is 07:00–19:00, stretched to whole hours whenever an entry or the clock falls outside it. It has one accessible name summarising the day; the segments are decorative.

### The Rail Button & Ring (signature)
A 48px circle. Idle: `--muted-foreground` icon (20px), hovering to a 6% `--foreground` wash and full ink. Active: the wash held, the large shadow, and the rail ring — a hairline of `--primary` at 60% around the circle, masked to fade from full at the top to nothing by 60% of the way down, so it is brightest where it meets the icon's top edge. The Timer button additionally carries the running dot (8px, `--primary`, top-right, breathing) while a timer runs; the Assistant button carries a 16px `--primary` count badge at Micro when nudges are waiting. Focus is the house ring.

### Badges / Chips
Fully rounded, Label 500, 8px/2px padding, transparent 1px border. Variants: default (`--primary` fill), secondary (`--secondary`), outline (hairline, ink), ghost, destructive, link. Project and tag chips carry a 6px colour dot before the label; entry-row tag chips shrink to 16px tall at Micro. The project badge is the swatch-tint treatment (13% tint, derived ink).

### Overlays
- **Dialog:** `--popover`, 12px corners, hairline, 24px padding, large shadow, over a 50% black scrim; fades and scales in from 95% at the base duration. Title at Subtitle; description at Body in muted ink, balanced.
- **Sheet:** `--popover`, large shadow, 12px corners on the open edge, hairline on that edge; slides at the slow duration, scrim included, on the shared curve (the Assistant panel is a sheet, so this is the most-felt motion in the app). Three-quarters width, capped at 384px.
- **Popover / dropdown / select:** `--popover`, 12px corners, hairline, medium shadow, 4px inner padding for menus and 16px for popovers; items are 8px-cornered at Body with `--accent` focus. Tooltips are the inverted surface with shortcut hints in `--background` at 60%.

### Keyboard Chip
See The One-Keycap Rule.

### Busy vs Not-Loaded-Yet
- **Spinner** (`ui/spinner.tsx`): "this specific action is working". Sizes sm 14px, default 16px (matches a button's icon), lg 20px (a whole panel). Never a hand-rolled spinning icon.
- **Skeleton**: "this surface hasn't loaded yet" — `--accent` at the pulse cadence, 6px corners, holding the layout.

### Calendar Blocks
Real entries: a translucent project-colour fill with a 3px solid left edge, 4px corners, no shadow, 2px/6px padding. Ghost (unconfirmed calendar event), gap (untracked time) and draft (proposed entry) blocks are dashed and solidify on hover; a running block dashes its left edge and breathes the running dot. Labels degrade by the *block's* width via container queries (duration drops below 144px, times below 84px), not by viewport. The today column is a 4% foreground wash; the now-indicator is `--primary`, 2px.

### The Period Control
"Today" is never hidden — visible-but-disabled when the period already contains today, so the toolbar does not reflow and the one period control never vanishes from the tab order. When the pane is too narrow for the requested calendar view, a Micro chip on `--muted` says "Showing 5 days" where the number changed.

## Do's and Don'ts

### Do:
- **Do** spend the brand red as a light: the Start disc's glow, the readout, the live segment, the active rail ring, one primary pill per header, the Settings underline (**The One Lit Control Rule**).
- **Do** keep every neutral at chroma zero in both themes (**The True-Neutral Rule**).
- **Do** draw every structural line as one device pixel of `--border`; wake a row's *edge* to `--border-strong` on hover, not its fill (**The Hairline Rule**).
- **Do** use the mono face with tabular figures for any duration, clock or column of numbers (**The Tabular Rule**).
- **Do** pick radius by family: pills for controls, 12px for containers, 2rem for the composer alone, the base scale for data cells (**Shapes**).
- **Do** build every route as a Pane — floating header, scroll-fade, no scrollbar — and pad its last row by `--dock-h`.
- **Do** render every pick-one control from the shared `SEGMENT_*` strings, with the active segment recessed in ink.
- **Do** use the `-ink` token whenever the brand, success or warning colour is text.
- **Do** pair every transition with a duration token and the quart curve; use `Spinner` for busy and `Skeleton` for not-loaded; put every shortcut in `Kbd`.
- **Do** gate touch targets and reveal-on-hover on input capability, not viewport width.
- **Do** show a real empty state (icon, title, one line) on any chart, list or breakdown with no data, and let dense legends and stat strips wrap rather than overflow.

### Don't:
- **Don't** tint a neutral — no cream, no sand, no cool charcoal, no warm grey. The ground is measured grey.
- **Don't** use the brand red as a wash or a large fill (the today column is a 4% *foreground* wash for this reason), and don't put `--primary` on small text — that is `--primary-ink`'s job.
- **Don't** make Stop destructive. Stopping saves; only Discard and Delete wear `--destructive`.
- **Don't** put a resting shadow on a card, row, input or button, and don't add hover lift to panels. A shadow means off-the-page: overlays, the composer, the lit disc.
- **Don't** add a second glass surface, a second capsule, or a third form of "running" — extend the pulse ring or the running dot.
- **Don't** write a bare transition, a 1px or 2px focus ring, an arbitrary font size, or a numeric z-index. ESLint fails the build on each: a transition utility without the quart easing, a thin or outline-hidden focus treatment instead of the house 3px ring at 50%, an arbitrary text size, and a raw 10/20/30/40/50 layer.
- **Don't** pair an icon-only button's size with an ad-hoc width/height; use the icon size tokens.
- **Don't** put `--muted-foreground` inside an active segment or on the rail's active pill — it is tuned for the track, and vanishes on the recessed pill; use `--foreground`.
- **Don't** tint a progress track with its fill colour (an empty bar reads as full), and don't paint a healthy fill in the accent. The default fill is ink; the budget ladder is ink → `--warning` at 80% → `--destructive` at 100%, and it stays monotonic.
- **Don't** use a dashed border for anything but "empty, click to fill".
- **Don't** hide "Today", and don't hide a primary action behind hover.
- **Don't** run the shadcn `init` against `index.css` — `add` is safe; `init` rewrites every measured token underneath its comment.
- **Don't** write a utility class name in backticks in any Markdown file; name the property or the token.

## Motion

Motion on the rack is confirmation, not performance: *did that register?*, *where did this come from?*, *is this still running?* Nothing bounces or springs.

**Scale** (`--transition-duration-fast` / `-base` / `-slow` = 150 / 200 / 300ms), chosen by how far a thing travels: fast for a state change in place (hover, focus, colour, a chevron); base for something appearing or leaving (overlays, popovers, rows, the just-stopped fade-up); slow for a panel-sized move (sheets, the dock, the main region's bottom padding).

**Curves.** `--ease-out-quart` (cubic-bezier 0.25, 1, 0.5, 1) is *the* curve; there is no separate enter and exit. `--ease-out-quint` (0.22, 1, 0.36, 1) is reserved for the one large slow move — the timer surfaces arriving — where a flatter tail keeps a big element from appearing to overshoot. Symmetric breathing stays on ease-in-out.

**Entrances** (tokens `--animate-fade-in` / `-fade-up` / `-scale-in`): routes crossfade in at the slow duration; rows fade up 8px at base; the disc's play/stop glyph scales in from 96%.

**One pull deploys** (`--animate-dock-in`, `--animate-capsule-in`): the docked bar rises from the bottom edge (100% translate to rest) and the composer settles from 16px below at 98% scale — the same motion at two scales, both slow on the quint curve.

**The running state** has exactly two forms and one 1.6s cadence, so when both are on screen they breathe together: the signature (`--animate-recording-pulse`), a flat `--primary` ring scaling from 1 to 1.7 and fading from 45% in dark (28% in light, where 45% read as a pink halo on the glass — `--pulse-peak`) behind the Stop disc, on the quart curve because it travels; and the quiet one (`--animate-running-dot`), an opacity-only breathe from 1 to 35% for dense surfaces — the rail dot, the ribbon's live segment (which also stands 2px proud of the track on each side, so "now" reads by shape in any palette), a running calendar block. These are the only infinite animations in the product.

**Just stopped** (`--animate-stopped`): the landed row fades up while a 16% `--primary` wash and a 3px inset left rail bloom and recede over 1.4s, so the eye tracks where the timer went.

**Reduced motion** collapses every animation and transition globally in `index.css`. Anything whose timing is coordinated in JS — the row that waits 200ms for its exit before committing a delete — reads the preference itself and shortens to zero, since the CSS rule cannot reach a timeout. A running state always survives the preference as colour and iconography.

## Layering

Five named tiers, registered in `index.css` as `--z-index-*`, so a new surface picks a meaning rather than a number.

| Tier | Value | For |
|---|---|---|
| sticky | 10 | Pane headers and their scroll-fade; headers and frozen first columns inside a scrolling grid. |
| overlay | 20 | Something covering a pane but not the app: the calendar's error wash, the ghost-count button, a sticky corner cell. |
| dock | 30 | The app-wide timer surfaces — the composer and the docked bar. Above every pane, below every portal, so a dialog still covers the running readout. |
| portal | 50 | Dialogs, sheets, popovers, dropdowns, selects, the focused skip link. |
| tooltip | 60 | Above portal on purpose: a tooltip on a control inside a dialog used to share the dialog's tier and rely on DOM order. |

A raw numeric layer fails ESLint. Sonner manages the toast layer itself and is left alone.

## Brand Mark & App Icons

The brand mark is a **circled analog clock reading ~10:10** (the classic "watch ad" angle): a brand-red circle, a white ring at 90% opacity, two rounded white hands, and a centre dot. It is the one place the brand red is a fill by definition — and, on the dark rail, the one place it is a light: three stacked red drop-shadows behind the mark, off in light mode.

**Single source of truth:** `packages/core/src/brand-mark.ts` — glyph geometry (`clockGlyph`), face ratio (0.39), and the pre-converted sRGB hexes of the brand tokens for surfaces that can't use `oklch()` (static assets, email, OG image):

| Token | oklch | hex |
|---|---|---|
| Brand red (light `--primary`) | `oklch(0.588 0.207 27.33)` | `#dd322e` |
| Brand red (dark `--primary`) | `oklch(0.65 0.207 27.33)` | `#f34a42` |

The file also exports `GROUND_LIGHT`, `GROUND_DARK` and `MUTED_INK_DARK` hexes that still encode the retired tinted ramp (0.988/0.185/0.72 with chroma); the app's own `--background` and `--muted-foreground` are the frontmatter values above, and those constants are stale drift, not a rule: regenerate them from the current tokens before the next `pnpm generate-icons`.

**Two consumers, one geometry:**
- `apps/web/src/react-app/components/brand/BrandMark.tsx` — the in-app mark (the rail's brand slot, the phone brand strip and nav sheet, login/signup). Fills the circle with `var(--primary)` so it tracks the theme.
- `scripts/generate-icons.mjs` (`pnpm generate-icons`) — every static asset: favicon (`logo.svg` + multi-res `favicon.ico`), PWA `any` + `maskable` icons, `apple-touch-icon`, PWA shortcut icons, OG share image, and the extension's four action icons.

**Named rule — One Clock.** No surface may draw its own clock glyph (including lucide's `Clock`) as a brand stand-in. The mark is always the shared geometry; change it in `brand-mark.ts` and re-run `pnpm generate-icons`. The lucide `Timer` icon on the rail is a *navigation* icon, not a brand mark — that distinction is the line.

**Satellite surfaces:** the extension popup consumes the same oklch tokens directly in its inline CSS (Chrome-only surface); transactional email uses the pre-converted hexes via `apps/web/src/worker/emails/theme.ts` and a deliberately text-only header ("timetracker.run") — no image logo in email, since image blocking would break it.
