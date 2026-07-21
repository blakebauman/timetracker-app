# Google Calendar sync

Pull your Google Calendar events onto the **Calendar** view as dashed "ghost"
blocks and **click one to confirm it into a tracked time entry** (you pick the
project at confirm time). Direction is inbound-only and read-through — the worker
fetches events live for the visible range; there is no import table. Confirmed
events are stamped with `calendar_event_id` so they stop appearing as ghosts.

On top of the manual flow there are two automated paths:

- **Auto-track** (opt-in toggle on the Settings card): a cron sweep
  (`scheduled()`, every 5 minutes) converts calendar events that have **already
  ended** into time entries automatically. Idempotent via
  `time_entries.calendar_event_id` — an event is only ever converted once.
- **Range convert** (`POST /api/calendar/convert`): confirm all events in a
  date range in one call.

Access is **read-only** (`calendar.readonly`) — the app never modifies your
calendar.

## One-time Google Cloud setup (required to enable the feature)

Until the two secrets below are set, the app runs fine and the Settings card shows
"Calendar sync isn't configured on this server yet."

1. In the [Google Cloud Console](https://console.cloud.google.com/):
   - **Enable the Google Calendar API** (APIs & Services → Library).
   - **OAuth consent screen**: add the scope
     `https://www.googleapis.com/auth/calendar.readonly` (it's a *sensitive*
     scope; while the app is unverified you're limited to test users / 100 users,
     which is fine for personal use — Google verification is required before a
     public launch).
   - **Credentials → Create OAuth client ID → Web application.** Keep this
     **separate** from the Google *login* client so it carries the calendar scope
     and its own redirect URIs. Add authorized redirect URIs:
     - `http://localhost:5173/api/calendar/google/callback` (local dev)
     - `https://timetracker.run/api/calendar/google/callback` (production)
   - Copy the client ID and client secret.

2. **Local dev** — add to `.dev.vars`:
   ```
   GOOGLE_CALENDAR_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CALENDAR_CLIENT_SECRET=GOCSPX-...
   ```

3. **Production** — set as Worker secrets:
   ```
   wrangler secret put GOOGLE_CALENDAR_CLIENT_ID
   wrangler secret put GOOGLE_CALENDAR_CLIENT_SECRET
   ```

4. **Database** — apply the migration that adds `time_entries.calendar_event_id`:
   ```
   wrangler d1 migrations apply time-tracker --remote
   ```

## Using it

- **Settings → Google Calendar → Connect** runs the OAuth consent flow and stores
  an encrypted refresh token (AES-GCM, keyed by `AUTH_SECRET`) in the
  `integrations` table as a `google_calendar` row (one per workspace).
- On the **Calendar** view, your events for the visible week/day show as dashed
  ghost blocks. **Click a ghost** → the "Track calendar event" dialog opens
  prefilled with the title and time → pick a project → **Add entry**. The ghost is
  replaced by the real tracked block.
- **Auto-track** — flip the toggle on the same Settings card
  (`PATCH /api/calendar/auto-track`) and ended meetings are materialized into
  entries by the cron without any clicking. Aski's nudges also surface untracked
  meetings with a one-click "Add to timesheet"
  (`POST /api/assistant/track-event`).
- **Disconnect** any time from the Settings card.

## What's filtered out

All-day events, cancelled events, and events you've declined are not shown.
Recurring events are expanded into individual instances (`singleEvents=true`).

## Scope / limitations

- Google **primary** calendar only.
- Ghost display is read-through — events load when you open the calendar range
  (the cron only *converts* ended events; it doesn't cache or mirror the
  calendar).
- Auto-track converts every ended event — there are no per-event rules or
  filters beyond the declined/cancelled/all-day exclusions.
- Google only. See `ROADMAP.md` for deferred phases (Outlook, multi-calendar,
  ghost dismiss state, webhook/delta sync, bidirectional).

## Implementation map

- Backend: `src/worker/lib/google-calendar.ts` (OAuth + events REST),
  `src/worker/routes/calendar.ts` (`/api/calendar/*`: connect, callback, status,
  events, auto-track toggle, convert, disconnect). Tokens encrypted via
  `src/worker/lib/crypto.ts`.
- Auto-track cron: `src/worker/lib/calendar-autotrack.ts` (`runAutoTrack`),
  wired into `scheduled()` in `src/worker/index.ts`; enabled per workspace via
  migration `0021_calendar_autotrack.sql`.
- Entry link: migration `0018_calendar_event_id.sql`; `calendarEventId` threaded
  through `CreateTimeEntrySchema`, the create route, and `formatEntry`.
- Assistant reuse: `src/worker/lib/assistant.ts` reads today's events through
  the same Google client for meeting nudges;
  `POST /api/assistant/track-event` is the nudge-side converter.
- Frontend: `useCalendarSync.ts` hooks, `api.calendar` client, ghost mapping in
  `calendarMapping.ts` (`externalEventToEvent`), rendering in
  `CalendarView`/`CalendarEventContent` (`tt-event-ghost`), click-to-track and
  prefill in the Timer workspace calendar view + `CalendarCreateDialog.tsx`, and
  the `GoogleCalendarCard` settings card (connect/disconnect + auto-track
  toggle).
