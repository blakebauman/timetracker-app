# Roadmap

Planned and deferred work. Shipped features live in git history and
[docs/USER_GUIDE.md](docs/USER_GUIDE.md), not here.

---

## Calendar sync — later phases

**Status:** Google sync is live and past "phase 1": manual click-to-confirm
(PR #22), plus the **auto-track cron** (`*/5 * * * *` `scheduled()` handler)
that materializes ended meetings into entries, and range conversion
(`POST /api/calendar/convert`). See [docs/CALENDAR_SYNC.md](docs/CALENDAR_SYNC.md)
for the shipped behaviour. Still deferred:

- **Outlook / Microsoft Graph** — same adapter shape as Google
  (`Calendars.Read`, delta queries).
- **Multi-calendar selection** — beyond the Google `primary` calendar.
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
  (`middleware/rate-limit.ts`) is in-isolate only; a Durable Object or KV-backed
  limiter would hold across isolates. Flagged in `extension/SECURITY_AUDIT.md`.

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
