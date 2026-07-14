---
name: verify
description: Runtime verification recipe for the time-tracker SPA — drive the real browser via Playwright, seed data through the authenticated API, and screenshot the surface.
---

# Verifying the time-tracker app

This is a full-stack React SPA (Vite + Cloudflare Worker/Hono + D1) with a
real-time WebSocket layer. The surface for almost every change is the **browser**.
Drive it with Playwright; don't substitute typecheck/tests for observation.

## Handle (launch)

Playwright is already configured (`playwright.config.ts`) and its `webServer`
block auto-runs `pnpm dev` against `http://localhost:5173` with
`reuseExistingServer` on, so you don't manage the server yourself.

Write a **throwaway driver spec** in `e2e/_verify_*.spec.ts`, run just it, then
delete it:

```bash
pnpm exec playwright test _verify_myflow --reporter=list
rm e2e/_verify_myflow.spec.ts
```

Default viewport (Desktop Chrome, 1280×720) is ≥ the `md` breakpoint, so the
**desktop sidebar is visible** (below `md` it's replaced by a mobile top bar).

## Auth + seeding

- `signUp(page)` from `e2e/auth.ts` creates a fresh account/workspace and lands
  on `/`. Each call is isolated — entries never collide.
- The project/task pickers have **no inline create**. Seed via the authenticated
  API using the page's cookie jar:
  ```ts
  await page.request.post("/api/projects", { data: { name: "Alpha", color: "#e11d48" } });
  ```
  (`color` must match `/^#[0-9a-f]{6}$/i`.)

## Driving specifics (selectors that work)

- Description input: `getByPlaceholder("What are you working on?")`.
- Start/Stop: `getByRole("button", { name: "Start" | "Stop" })`.
- **Project/Task picker trigger** has no accessible name — locate it by its
  chevron: `.locator("header button").filter({ has: page.locator("svg.lucide-chevron-down") })`.
  Picker options are cmdk items: `getByRole("option", { name: /Alpha/ })`.
- The **running entry appears as an editable row** in the Today list. Edit its
  project via: row hover → `getByRole("button", { name: "Entry actions" })` →
  `getByRole("menuitem", { name: "Edit" })` → dialog picker → `Save changes`.
- Sidebar collapse/expand: `getByRole("button", { name: "Collapse sidebar" | "Expand sidebar" })`.
- Sidebar running-timer elapsed text is `aside span.font-mono` (expanded only;
  collapsed shows a dot with `aria-label={/Timer running/}`).

## Flows worth driving

- **Timer lifecycle:** start → running row appears → stop → moves to list, bar clears.
- **Cross-tab sync (WebSocket):** open a 2nd `page` in the same `context` *before*
  acting; changes in tab A propagate to tab B's bar without reload.
- **Running-entry ↔ bar project/description sync:** edits from the list row must
  reflect in the timer bar, and `elapsed` must not reset (same-id merge).

## Calendar (FullCalendar) — /calendar

- Grid: `.fc-timegrid-slots`; slot lanes: `.fc-timegrid-slot-lane`. The grid is
  scrolled to ~08:00, so early lanes (`nth(0..15)`) are **above the viewport** —
  target visible lanes (08:00 ≈ index 16, 12:00 ≈ index 24).
- **Create by clicking** an empty slot (`page.mouse.click` on a visible lane) →
  opens the "New entry" dialog. Reliable. Scope the dialog by name —
  `getByRole("dialog", { name: "New entry" })` — since the project-picker popover
  also has `role=dialog`.
- **Drag interactions (drag-select create, event move, event resize) do NOT
  finalize under Playwright's synthetic events** — FC renders the selection
  highlight but never fires `select`/`eventDrop`/`eventResize` on mouseup. Verify
  drag features manually in a real browser; use click-to-create for automation.
- Event blocks: `.fc-event` (running entry adds `.tt-event-running`). Custom
  content renders description + `HH:MM–HH:MM · dur` + project label.

## Gotchas

- To exercise WS cross-tab sync, the second tab must be open **before** the
  broadcast fires — it only receives live events, not history.
- Editing a running entry must preserve the running clock; assert `elapsed`
  didn't reset (e.g. clock still shows `00:00:0x`), not just that fields updated.
- **FullCalendar `initialView` must be a constant** — binding it to changing
  state re-initializes the calendar and silently stops declarative `events`
  updates after a view switch. Drive view changes through `getApi().changeView()`.
- **`eventContent` must tolerate events with no `extendedProps.entry`** (selection
  mirrors / drag placeholders) — a throw there breaks FC's whole React subtree, so
  newly created entries stop rendering until a full reload.
