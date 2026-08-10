# Roadmap

Planned and deferred work. Shipped features live in git history and
[docs/USER_GUIDE.md](docs/USER_GUIDE.md), not here.

*Last audited against the tree at `8495f91` (2026-08-10) — every item below was
re-verified as still open at that commit.*

---

## Calendar sync — later phases

**Status:** Google sync is live and past "phase 1": manual click-to-confirm
(PR #22), plus the **auto-track cron** (`*/5 * * * *` `scheduled()` handler)
that materializes ended meetings into entries, and range conversion
(`POST /api/calendar/convert`). See [docs/CALENDAR_SYNC.md](docs/CALENDAR_SYNC.md)
for the shipped behaviour. Still deferred:

- **Outlook / Microsoft Graph** — same adapter shape as Google
  (`Calendars.Read`, delta queries). Nothing Microsoft-side exists yet; the
  `integrations` row provider column is the extension point.
- **Multi-calendar selection** — beyond the Google `primary` calendar.
  `lib/google-calendar.ts` hardcodes `calendars/primary/events`; this needs a
  calendar-list fetch, a per-workspace selection stored on the integration, and
  a fan-out over the selected ids in both the read-through and the cron.
- **Dismiss / ignore state for ghost events** — hide specific unconfirmed
  events on the calendar grid (needs a small table). The assistant's *nudge* dismissals
  exist but are client-side only and don't hide calendar ghosts.
- **Webhook / delta sync** — near-real-time updates instead of the 5-minute
  cron + read-through-on-view.
- **Bidirectional** — push tracked time back out as calendar events.

### Reuses (already in the codebase)
The `integrations` table + workspace scoping, `encryptJSON`/`decryptJSON`
(`src/worker/lib/crypto.ts`), the `scheduled()` cron handler + per-workspace
sweep pattern (`lib/calendar-autotrack.ts`), the calendar view +
`CalendarCreateDialog`, the `calendar_event_id` link on `time_entries`, and the
WebSocket `broadcast` for live refresh.

---

## Backend hardening

- **Cross-isolate auth rate limiting** — the credential-endpoint limiter
  (`middleware/rate-limit.ts`) is in-isolate only; a distributed attacker (or one
  user spread across colos) gets N× the configured limit. Flagged in
  `extension/SECURITY_AUDIT.md` and again in the July 2026 audit. Cheapest
  durable fix: a zone-level **WAF rate-limiting rule on `/api/auth/*`**
  (dashboard config, no code); alternatives are the Workers Rate Limiting
  binding or a DO-backed counter for the email-sending + AI endpoints
  specifically. OTP brute force is already safe regardless (Better Auth's
  DB-backed 3-attempt limit holds across isolates).
- **CSP tightening** — two CSPs exist and only one of them matters much.
  `public/_headers` governs the **document** (where the Assistant renders LLM
  output) and is already tight: connect-src pinned to `'self'
  https://timetracker.run wss://timetracker.run`, plus `base-uri`,
  `object-src 'none'`, `form-action 'self'`. The remaining real gap there is
  `script-src 'self' 'unsafe-inline'` → nonce/hash-based, which needs Vite to
  emit a nonce-able build (no inline bootstrap) or a hash allow-list generated
  at build time. `middleware/security-headers.ts` is the loose one
  (`'unsafe-inline'`, any-host `wss:`/`ws:`) but only ever lands on `/api/*`
  and `/agents/*` responses (`assets.run_worker_first`) — JSON and WebSocket
  upgrades, which execute no scripts. Tightening it is hygiene for
  defence-in-depth, not the mitigation the Assistant needs.

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
- **Compatibility date bump** — currently `2025-10-08` in `wrangler.jsonc`,
  about ten months of default-on flag changes behind. Own PR, run the full e2e
  suite. The specific payoff: crossing `2026-04-07` enables
  `web_socket_auto_reply_to_close`, which makes the manual close-handshake
  workaround in `TimerRoomDO.webSocketClose` redundant (the call stays safe —
  it is silently ignored once the socket is already closed). Read the flag
  changelog for the whole interval before bumping, not just that one entry.
- **TimerRoomDO → SQLite-backed DO migration** — the class is on the legacy
  KV backend (`new_classes` in the v1 migration) with no in-place migration
  path from Cloudflare. It stores nothing persistent today, so a
  delete-and-recreate migration is free *now* and gets costly the moment
  state is added. Do it before ever writing to `ctx.storage`.
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

## Loose ends

- **Extension is not published** — `trustedOrigins` in `src/worker/auth.ts`
  pins only the dev-key extension ID
  (`chrome-extension://nogikmhdpnnedmfldanickgpikmifcje`). Chrome Web Store
  upload is the blocker; after the first upload the store-assigned ID has to be
  added alongside it (or the manifest `key` kept so the ID matches), per
  `extension/PUBLISHING.md`. Until then the extension only authenticates when
  loaded unpacked from `extension/.keys/extension.pem`.
- **Dead `two_factor` table** — migration `0017_two_factor_and_passkey.sql`
  still creates it, but nothing has referenced `twoFactor` since passwords were
  retired in #73 (the enable flow required a password). Passkey from the same
  migration is live; only the TOTP half is orphaned. Drop it in a migration
  whenever the next schema change lands — no urgency, it costs nothing but
  reads as live schema.

## Ideas / backlog

- **Desktop app (Tauri) for OS-level idle detection** — the web app can only
  see in-page activity, so "idle" can't distinguish *left the machine* from
  *working in another native app*. Cross-session activity relay via
  `TimerRoomDO` + the hidden-tab gate (shipped) fix the multi-device false
  positives, but true away-from-keyboard detection needs a native shell.
  A [Tauri](https://github.com/tauri-apps/tauri) wrapper around the existing
  SPA could read system idle time (e.g. the `user-idle` crate) and feed it in
  as just another activity source — it would *complement* the web idle
  detection (browser/PWA users still need it), not replace it.
