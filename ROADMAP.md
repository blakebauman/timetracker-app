# Roadmap

Planned and deferred work. Shipped features live in git history / CHANGELOG, not here.

---

## Calendar sync — later phases

**Status:** phase 1 shipped (PR #22) — Google, primary calendar, manual
click-to-confirm. See [docs/CALENDAR_SYNC.md](docs/CALENDAR_SYNC.md) for the
shipped behaviour and setup. The items below are deferred.

- **Outlook / Microsoft Graph** — same adapter shape as Google
  (`Calendars.Read`, delta queries).
- **Background auto-sync** — a Cron Trigger + `scheduled()` handler (none today)
  or a Durable Object alarm, instead of the current read-through-on-view.
- **Multi-calendar selection** — beyond the Google `primary` calendar.
- **Dismiss / ignore state** — hide specific ghost events (needs a small table).
- **Webhook / delta sync** — near-real-time updates.
- **Bidirectional** — push tracked time back out as calendar events.

### Reuses (already in the codebase)
The `integrations` table + workspace scoping, `encryptJSON`/`decryptJSON`
(`src/worker/lib/crypto.ts`), the adapter registry (`src/worker/integrations/`),
the `/calendar` view + `CalendarCreateDialog`, the `calendar_event_id` link on
`time_entries`, and the WebSocket `broadcast` for live refresh.

---

## Ideas / backlog

- (add future items here)
