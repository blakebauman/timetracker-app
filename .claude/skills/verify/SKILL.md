---
name: verify
description: Runtime verification recipe for the time-tracker SPA — drive the real browser with a throwaway Playwright spec, seed data through the authenticated API, and screenshot the surface. Use to confirm a UI or API change actually works in the running app (not just that it typechecks), before committing, or when asked to "verify", "check it in the browser" or "screenshot it".
---

# Verifying the time-tracker app

This is a full-stack React SPA (Vite + Cloudflare Worker/Hono + D1) with a
real-time WebSocket layer. The surface for almost every change is the **browser**.
Drive it with Playwright; don't substitute typecheck/tests for observation.

## Handle (launch)

Playwright lives in the `apps/web` workspace (`apps/web/playwright.config.ts`) and its
`webServer` block auto-runs `pnpm dev` against `http://localhost:5173` with
`reuseExistingServer` on, so you don't manage the server yourself. Run it via
`pnpm --filter @timetracker/web exec playwright …` from the repo root (there is no
root Playwright binary); a throwaway config goes at `apps/web/playwright.verify.config.ts`.

Write a **throwaway driver spec** in `apps/web/e2e/zz-verify-*.spec.ts`, run just it, then
delete it (`rm` is aliased to `rm -i` here and hangs a Bash call — use `/bin/rm -f`):

```bash
pnpm --filter @timetracker/web exec playwright test zz-verify-myflow --reporter=list
/bin/rm -f apps/web/e2e/zz-verify-myflow.spec.ts
```

Screenshots and scratchpad paths belong **only** in these throwaway files — a committed
spec that writes one fails on CI with ENOENT (a hook flags it).

**Check the port first:** `lsof -nP -iTCP:5173 -sTCP:LISTEN`. Another Vite app often holds
5173 and `reuseExistingServer` will silently drive it (every test times out at `signUp`).
For non-WebSocket checks, run `pnpm dev --port <N> --strictPort` yourself and give a
throwaway `apps/web/playwright.verify.config.ts` only a `baseURL`. WebSocket/cross-tab and
calendar OAuth need 5173 — ask before freeing it.

Default viewport (Desktop Chrome, 1280×720) is ≥ the `md` breakpoint, so the
**navigation rail** (`aside[aria-label="Navigation rail"]`) is visible; below `md` it's
a top strip with an `Open navigation menu` sheet.

## Auth + seeding

- `signUp(page)` from `apps/web/e2e/auth.ts` creates a fresh account/workspace and lands
  on `/`. Each call is isolated — entries never collide.
- The project/task pickers have **no inline create**. Seed via the authenticated
  API using the page's cookie jar — **writes need an explicit Origin header** (CSRF):
  ```ts
  const origin = new URL(page.url()).origin;
  const res = await page.request.post("/api/projects", {
    headers: { origin },
    data: { name: "Alpha", color: "#e11d48" },
  });
  expect(res.ok(), `${res.status()} ${await res.text()}`).toBeTruthy();
  ```
  (`color` must match `/^#[0-9a-f]{6}$/i`.) Entries are `/api/time_entries` (underscore);
  updating one is `PUT /:id` — a PATCH returns a bare 404 that looks like a missing row.

## Driving specifics (selectors that work)

- Description input: `getByPlaceholder("What are you working on?")`.
- Start/Stop: `getByRole("button", { name: "Start timer" | "Stop timer", exact: true })` —
  without `exact` "Stop" also matches an entry whose description contains it. Discard is
  `Discard timer` then the confirm's `Discard`. The dock is `header[aria-label="Timer controls"]`.
- **Project/Task/Tag picker triggers** are named: `getByRole("button", { name: /^Project:/ })`
  when one is selected, `"Select project"` when not (same shape for task and tags).
  Picker options are cmdk items: `getByRole("option", { name: /Alpha/ })`.
- **Date fields**: `getByRole("button", { name: /^Date:/ })`.
- **Calendar display preferences** (Day/5-day/Week/Month, weekends, gaps, row
  height) live behind `getByRole("button", { name: "View options" })`.
- The **running entry appears as an editable row** in the Today list. Edit its
  project via: row hover → `getByRole("button", { name: "Entry actions" })` →
  `getByRole("menuitem", { name: "Edit" })` → dialog picker → `Save changes`.
- Rail destinations are links named by route (`getByRole("link", { name: "Tasks" })`);
  Assistant, `Search and commands` and the account menu sit at the foot. The rail has no
  collapse state.

## Flows worth driving

- **Timer lifecycle:** start → running row appears → stop → moves to list, bar clears.
- **Cross-tab sync (WebSocket):** open a 2nd `page` in the same `context` *before*
  acting; changes in tab A propagate to tab B's bar without reload.
- **Running-entry ↔ bar project/description sync:** edits from the list row must
  reflect in the timer bar, and `elapsed` must not reset (same-id merge).

## Calendar (FullCalendar) — a Timer view (`/calendar` redirects to `/`)

- **FullCalendar 7 has no stable `.fc-*` class names** (they're minified). Select
  on the unstyled `tt-fc-*` hooks `components/calendar/calendarClasses.ts` adds:
  `.tt-fc-slot` (one per 30-min row), `.tt-fc-lane` (a day column; `.tt-fc-future`
  on days after today), `.tt-fc-day-header`, `.tt-fc-day-cell` (month).
- The grid opens at 08:00 in the morning and an hour before now after 09:00,
  so which rows are on screen depends on the clock. Index rows by time
  (`nth(n)` is `n × 30min` after midnight: 08:00 = 16, 12:00 = 24) and call
  `scrollIntoViewIfNeeded()` on the row or block before reading its box.
- **Create by clicking** an empty slot → opens the "New entry" dialog. Click by
  **coordinates** (`page.mouse.click` at the slot's `boundingBox()`): the day
  lanes are layered over the slot rows, so `locator.click()` on a slot waits on a
  covered element until timeout. Reliable. Scope the dialog by name —
  `getByRole("dialog", { name: "New entry" })` — since the project-picker popover
  also has `role=dialog`.
- **Drag interactions (drag-select create, event move, event resize) do NOT
  finalize under Playwright's synthetic events** — FC renders the selection
  highlight but never fires `select`/`eventDrop`/`eventResize` on mouseup. Verify
  drag features manually in a real browser; use click-to-create for automation.
- Event blocks: `.tt-event`, plus `.tt-event-running` / `-ghost` / `-gap` / `-draft` /
  `-planned` by kind. Custom
  content renders description + `HH:MM–HH:MM · dur` + project label.

## Preferences are server-backed — don't poke localStorage

`timeFormat`, `currency`, `weekStart` and friends live in the zustand-persisted
`time-tracker-ui` blob **and** are rehydrated from D1 by `useSettings` on load.
Writing `localStorage` (either the legacy `pref_*` keys or the persisted blob)
is silently overwritten on the next render, so a test that sets it will appear to
pass while measuring the *old* value. Drive the real control instead:

```ts
await page.goto("/settings");
await page.getByRole("button", { name: "12h", exact: true }).click();
```

## Theme: toggle via next-themes, never the class

`main.tsx` mounts `next-themes` with `attribute="class"`, which re-syncs
`documentElement.classList`. Calling `classList.toggle("dark")` directly leaves
the DOM in a mixed state — light tokens over dark surfaces — for long enough that
**axe-core reports phantom `color-contrast` violations** that don't exist in the
real app. This cost a full false-positive triage once. Set the theme through the
UI (or `localStorage.theme` + a reload) and assert
`documentElement.className` is exactly `light`/`dark` before measuring.

## Gotchas

- To exercise WS cross-tab sync, the second tab must be open **before** the
  broadcast fires — it only receives live events, not history.
- Editing a running entry must preserve the running clock; assert `elapsed`
  didn't reset (e.g. clock still shows `00:00:0x`), not just that fields updated.
- **FullCalendar `initialView` must be a constant** — binding it to changing
  state re-initializes the calendar and silently stops declarative `events`
  updates after a view switch. Drive view changes through `getApi().changeView()`.
- **React sets `value` as a property, not an attribute** — `input[value='1h 30m']`
  never matches. Locate inline edit inputs by their container instead
  (`page.locator(".group").first().locator("input")`).
- **Viewport size alone doesn't emulate touch.** `setViewportSize` leaves
  `pointer: fine` / `hover: hover`, so hover-revealed controls (`.tt-reveal`)
  stay hidden and any conclusion about touch reachability is wrong. Use
  `test.use({ hasTouch: true, isMobile: true })`.
- **Calendar grid density follows the *pane*, not the viewport** (see
  `lib/calendarDensity.ts`). Split at 1280 renders a single day column, not a
  week — assert on `.tt-fc-day-header` counts rather than assuming.
- **`eventContent` must tolerate events with no `extendedProps.entry`** (selection
  mirrors / drag placeholders) — a throw there breaks FC's whole React subtree, so
  newly created entries stop rendering until a full reload.
