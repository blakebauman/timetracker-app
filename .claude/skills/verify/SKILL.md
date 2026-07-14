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

## Gotchas

- To exercise WS cross-tab sync, the second tab must be open **before** the
  broadcast fires — it only receives live events, not history.
- Editing a running entry must preserve the running clock; assert `elapsed`
  didn't reset (e.g. clock still shows `00:00:0x`), not just that fields updated.
