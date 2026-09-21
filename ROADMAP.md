# Roadmap

Planned and deferred work. Shipped features live in git history and
[docs/USER_GUIDE.md](docs/USER_GUIDE.md), not here.

*Last audited against the tree at `7dced14` (2026-08-25) — every item below was
re-verified as still open at that commit.*

---

## Calendar sync — later phases

**Status:** Sync is live for **both Google and Outlook / Microsoft 365** (PR
#115), each optional and connectable at the same time. Manual click-to-confirm
(PR #22), the **auto-track cron** (`*/5 * * * *` `scheduled()` handler) that
materializes ended meetings into entries, and range conversion
(`POST /api/calendar/convert`) all work provider-agnostically through
`lib/calendar-connections.ts`. See
[docs/CALENDAR_SYNC.md](docs/CALENDAR_SYNC.md) for the shipped behaviour and the
Entra registration steps. Still deferred:

- **A real Graph round-trip has never run.** The OAuth shape, the state guards
  and the refactor are verified, but no event has actually been fetched from
  Microsoft — the local-naive timestamp handling (`Prefer: outlook.timezone`) is
  reasoned and commented rather than observed. First connection should check an
  event's grid position against Outlook.
- **Multi-calendar selection** — both providers read only the default calendar
  (`calendars/primary/events`, `me/calendar/calendarView`). Needs a calendar-list
  fetch, a per-connection selection stored on the integration row, and a fan-out
  over the selected ids in both the read-through and the cron.
- **Dismiss / ignore state for ghost events** — hide specific unconfirmed
  events on the calendar grid (needs a small table). The assistant's *nudge* dismissals
  exist but are client-side only and don't hide calendar ghosts.
- **Webhook / delta sync** — near-real-time updates instead of the 5-minute
  cron + read-through-on-view.
- **Bidirectional** — push tracked time back out as calendar events.

### Reuses (already in the codebase)
The provider seam (`lib/calendar-providers.ts` registry +
`lib/calendar-connections.ts`) — a third provider is a new module and one
registry entry, nothing else. Plus the `integrations` table + workspace scoping,
`encryptJSON`/`decryptJSON` (`apps/web/src/worker/lib/crypto.ts`), the `scheduled()` cron
handler + per-workspace sweep pattern (`lib/calendar-autotrack.ts`), the calendar
view + `CalendarCreateDialog`, the `calendar_event_id` link on `time_entries`,
and the WebSocket `broadcast` for live refresh.

---

## Drafting, pacing, digests and MCP — next phases

**Status:** all four shipped 2026-08-24/25 (PRs #108, #111, #112, #114) and are
deployed. What's deferred is mostly *depth*, and the first item is a caveat
rather than a feature.

- **None of it has been exercised much in production.** Zero drafts have been
  created, digests have only ever been sent as manual previews (never on the
  schedule), and no project carries a budget so pacing reports `no_budget` for
  everything. Three of the five bugs found on launch night came from running the
  features against realistic data (`pnpm seed:demo`) and from actually reading a
  delivered email — build on top of these only after they've been used.
- **Learning from corrections** — persist `signal keyword → project` every time a
  drafted entry is reassigned, and let the deterministic map win before the model
  runs (same precedence as `runProjectColorAssignment`). This is what stops
  drafting being annoying by week three. Genuinely worthless until drafting has
  real usage to learn from.
- **Activity categories** — a two-level, cross-project work-type tree
  (Design / Client meetings / Revisions / Admin), auto-assigned from the entry
  description. Answers "where is time going" *across* clients, which the
  project/client/tag grouping can't. Tags are the weak version of this.
- **Extension as a capture signal** — opt-in: the browser extension records
  active tab domain + title in ~2-minute buckets and posts them to a signals
  endpoint, feeding the draft pipeline. Must ship *with* its privacy primitives,
  not after: per-domain allow/blocklist, one-tap pause, explicit retention, and
  domain+title only — never page content.
- **Project import** from spreadsheet / PDF / screenshot / pasted rows, with a
  New / Updated / Existing / Not-importing diff preview before anything applies.
  Workers AI handles text/CSV today; screenshots need a vision model.
- **Timesheet flags** — threshold rules (added-time limit, % increase over
  drafted, daily total cap) marking a day worth a second look.
- **MCP: OAuth** — the server authenticates with a workspace API key, which every
  header-capable client supports but Claude Desktop's built-in connector flow
  does not (it expects OAuth, hence the `mcp-remote` bridge in
  [docs/MCP.md](docs/MCP.md)). Implementing OAuth would remove that bridge.
- **Public REST API v1** — the natural companion to the API keys that already
  exist; `docs/MCP.md` describes the auth model it would reuse.

### Explicitly rejected
Desktop screen capture, meeting transcription, and enterprise identity (SCIM,
Okta/Entra SSO, manager approval chains). The first two are the wrong stack and
a privacy burden; the third has no audience — this workspace is one person
tracking their own hours against engagement codes, not a firm billing clients
through the app.

---

## Backend hardening

- ~~**Cross-isolate auth rate limiting**~~ — shipped September 2026: the app's
  limiters moved to Workers Rate Limiting bindings (per workspace / user / API
  key, shared across isolates in a colo) and Better Auth's own limiter — which
  had been silently disabled in production because it keys off `NODE_ENV` — is
  now pinned on with D1 storage (migration 0033). See `docs/ARCHITECTURE.md` →
  "Rate limiting". **Still to do (dashboard, no code):** the zone-level WAF
  rate-limiting rule on `/api/auth/*` and `/mcp`, which is the cross-colo
  backstop for the per-colo binding.
- ~~**CSP tightening**~~ — shipped September 2026. The one inline bootstrap
  script (theme resolution + transition guard) moved to `public/boot.js`, so
  the document's `script-src` is `'self'` with no `'unsafe-inline'` — no
  nonce plumbing needed, because `_headers` is static and the script is now
  a file. `middleware/security-headers.ts` carries the identical policy
  (`base-uri`, `object-src 'none'`, `form-action`, pinned `connect-src`) so
  there is one CSP to reason about even though the worker's copy only lands
  on JSON and WebSocket responses. Still open: `style-src 'unsafe-inline'`,
  which React, FullCalendar and Recharts need for `style=` attributes.
- ~~**Agents SDK 0.17 → 0.24 (+ `@cloudflare/ai-chat` 0.12)**~~ — shipped in
  #147. The one code change was `/mcp` calling `createLegacyMcpHandler` by
  name: since 0.20 `createMcpHandler` expects an MCP SDK **v2** server
  factory, and this server is built on `@modelcontextprotocol/sdk` 1.x. **Still
  open:** the SDK v2 move itself (new `@modelcontextprotocol/server` package,
  `createMcpHandler` with a factory, and then the stateless handler's
  `allowedOriginHostnames` becomes relevant). First deploy after #147 runs the
  SDK's one-way Durable Object SQLite migrations on each agent's first wake;
  a rollback after that loses at most the 100-message chat history.
- **Workspace role policy (decision, not a bug)** — every route gates on
  membership only; any member can mint a `read_write` API key with no expiry
  (`routes/api-keys.ts`), rewrite or delete integration credentials
  (`routes/integrations.ts`) and disconnect the calendar (`routes/calendar.ts`).
  Membership already grants full read/write, so this is not escalation, but
  owner and member are indistinguishable. If owner/admin-only is wanted it is
  a ~30-line `requireRole` middleware over `member.role` in
  `middleware/workspace.ts` applied to those three routers.
- **Dashboard-only hardening (no code)** — done via the API on 2026-09-21:
  zone minimum TLS 1.2 (was 1.0) and Always Use HTTPS on; Dependabot alerts
  + automated security fixes and CodeQL default setup enabled; `main` now
  requires `e2e`, `Lint (eslint)`, `Typecheck` and `Build`, with
  `enforce_admins`; D1 Time Travel answered a 10-day-old timestamp, so the
  account is on the 30-day retention tier. **Still open:** WAF rate-limiting
  rules on `/api/auth/*` and `/mcp` (the local API token has no zone
  rulesets permission — dashboard, or a token with WAF write); `; preload` on
  HSTS after 30 clean days of Always Use HTTPS; Chrome Web Store upload of
  extension 1.0.3, then add the store-assigned `chrome-extension://<id>` to
  `trustedOrigins` and `ALLOWED_ORIGINS`.

---

## Deferred from the July 2026 production audit (PR #79)

Deliberate deferrals, not oversights — each has a trigger. The audit's
fix-now items (membership checks, delete-user gate, batched reports/tags,
immutable asset caching, auth indexes, cron logging/concurrency, lazy
AssistantPanel) shipped in #79.

- **Smart Placement trial** — `"placement": { "mode": "smart" }` in
  `wrangler.jsonc`. The worker is D1-chatty, so running it near the D1 primary
  collapses remaining serial-query latency for far-away users. Measure
  before/after; one-line and reversible. Trigger: users outside North America.
- **D1 read replication (Sessions API)** — wrap read-heavy report/list queries
  in `env.DB.withSession("first-unconstrained")` with bookmark passthrough via
  a response header for read-your-writes. Free (replicas are automatic); pairs
  with, and partly overlaps, Smart Placement. Same trigger.
- ~~**Compatibility date bump**~~ — shipped in #88 (`2025-10-08` → `2026-07-08`,
  pinned to the installed workerd rather than "today"). Crossing `2026-04-07`
  turned on `web_socket_auto_reply_to_close` and the manual close-handshake
  workaround was removed.
- ~~**TimerRoom → SQLite-backed DO migration**~~ — shipped in #89. Worth
  recording what it actually took, because this item under-described it: there
  is **no** in-place KV→SQLite path ("you cannot enable a SQLite storage
  backend on an existing, deployed Durable Object class"), so it required
  deleting the namespace and creating a new one — and because a class name
  can't be both deleted and live in one config, the class had to be renamed
  `TimerRoomDO` → `TimerRoom`. Free only because the DO had never persisted
  anything. **`TimerRoom` must not write to `ctx.storage`** casually now: it is
  SQLite-backed and its data is real, so there is no second free move.
- **Projects list `trackedSeconds` split** — `GET /api/projects` recomputes
  all-time `SUM(duration)` over the whole entries table on one of the hottest
  endpoints, for a number only the Projects page shows. Move it behind a
  `?withTracked=1` flag. Trigger: workspaces with multi-year entry history.
- **Cron sweep → Queues** — auto-track runs with bounded concurrency (5,
  `lib/calendar-autotrack.ts`), which is fine to a few hundred auto-track
  workspaces; past that, the cron should enqueue workspace IDs and a queue
  consumer should fan out. Note `runRecurring` never got the same treatment —
  it is still a fully serial `for` loop over every active template, so it hits
  the wall first despite being the cheaper job per row.
- **`/reports/detailed` real pagination** — capped at 10k rows in #79 as a
  memory guard; replace with keyset pagination + a streaming CSV export if any
  workspace approaches the cap.
- **Frontend boot waterfall** — HTML → JS → session → data is serial; kick off
  the `get-session` fetch before React mounts to overlap it with JS parse.
  Smaller wins behind it: lazy date-picker popover, `zod/mini` on the client.
- **Stayed on D1 (decision)** — Neon-via-Hyperdrive was evaluated and
  rejected: same single-region latency structure, large raw-SQL migration,
  second vendor, and Hyperdrive's read cache doesn't invalidate on writes
  (wrong fit for a read-after-write timer app). Revisit only if two or more
  materialize: pgvector-grade search, the 10 GB D1 ceiling, interactive
  transactions, per-PR database branching.

---

## Deferred from the entry-list inline-edit audit (PRs #84, #85)

Found while fixing the row-identity bug in #84 (rows were keyed by the
description and project they edit inline). Each was in scope of the audit and
deliberately left out of those PRs to keep the diffs about one thing; none is
blocking.

*The first three items shipped in #87 — bulk update's optimistic path, the
group chip's acknowledgement it unblocked, and per-row rollback. Removed from
this list; the two below remain open.*

*All items in this section have shipped — #87, #94, and #95. Kept as a record of
what the audit turned up; nothing here is outstanding.*

- ~~**"Assign project" is two different controls with one name**~~ — fixed in
  #94: the row chip is now "Assign project to this entry", matching the scoped
  label the group chip already carried.
- ~~**Micro-label sizes below the ramp floor**~~ — closed across #94 and #95.

  Worth recording that this item was filed wrong. It claimed "43 occurrences off
  the ramp"; in fact `DESIGN.md` §3 had always documented **Micro** as a real
  10px step, so 28 of those were on the ramp and merely spelled as arbitrary
  values. #94 named the step (`text-micro`) and swept them with byte-identical
  CSS output. Only 15 sizes were genuinely off-ramp.

  #95 resolved those 15 site by site rather than uniformly, and the result was
  a rule, not a pile of exceptions: 12 were secondary lines under a 12px
  heading → Micro; 3 were the sole content of their own block (the calendar's
  untracked-gap affordance, a `<code>` key, a dropdown group label) → Label.
  That is now **The Two-Tier Rule** in `DESIGN.md`, so the next dense component
  doesn't have to re-derive it.

  The app now has zero arbitrary font sizes. One trap to remember: Tailwind
  scans Markdown here, so writing class syntax in prose emits real dead CSS —
  this file was shipping one that way.

---

## Loose ends

- **Extension is not published** — `trustedOrigins` in `apps/web/src/worker/auth.ts`
  pins only the dev-key extension ID
  (`chrome-extension://nogikmhdpnnedmfldanickgpikmifcje`). Chrome Web Store
  upload is the blocker; after the first upload the store-assigned ID has to be
  added alongside it (or the manifest `key` kept so the ID matches), per
  `apps/extension/PUBLISHING.md`. Until then the extension only authenticates when
  loaded unpacked from `apps/extension/.keys/extension.pem`.
- ~~**Dead `two_factor` table**~~ — dropped in migration 0034 (September 2026),
  which also gave `saved_reports` and `assistant_memory` the cascading tenant
  foreign keys every other table had, and made `(organizationId, userId)`
  unique on `member`. `user.twoFactorEnabled` stays (a column drop is another
  table rebuild; the default 0 is harmless).

## Deferred from the September 2026 polish pass

- **One palette source** — `worker/lib/colors.ts` and `react-app/lib/colorUtils.ts`
  are two hand-maintained copies of the same 18 hexes; the contrast spec imports
  only the web one. Hoist into `@timetracker/core` and import from both, or add a
  parity assertion.
- **Contrast spec coverage** — `e2e/contrast.spec.ts` guards swatch ink and
  `--primary-ink` only. `--success-ink`, `--warning-ink`, `--destructive` and
  muted ink on the rail are asserted in `index.css` comments and nowhere else.
- **Icon glyph size** — ~115 call sites pass a 14px icon into the 16px slot the
  button primitives declare. It reads as deliberate density and a sweep is churn,
  but two spellings of the same size (`h-N w-N` vs `size-N`) keep growing.
- **"Copy last week" partial failure** — the timesheet fires one create per
  entry with no per-item handling; a half-copied week needs a batch endpoint.
- **Timer header at phone width** — the five-segment view switcher plus the
  split Add pill is the tightest toolbar in the app and wraps to three rows at
  400px; a design decision, not a polish item.
- **Queued API-key mints** — a `POST /keys` is now excluded from the offline
  replay queue (the secret only exists in the response); the same question
  applies to any future write whose response is the point.

## Ideas / backlog

- **Desktop app (Tauri) for OS-level idle detection** — the web app can only
  see in-page activity, so "idle" can't distinguish *left the machine* from
  *working in another native app*. Cross-session activity relay via
  `TimerRoom` + the hidden-tab gate (shipped) fix the multi-device false
  positives, but true away-from-keyboard detection needs a native shell.
  A [Tauri](https://github.com/tauri-apps/tauri) wrapper around the existing
  SPA could read system idle time (e.g. the `user-idle` crate) and feed it in
  as just another activity source — it would *complement* the web idle
  detection (browser/PWA users still need it), not replace it.
