# Calendar sync (Google + Outlook / Microsoft 365)

Pull your calendar events onto the **Calendar** view as dashed "ghost" blocks
and **click one to confirm it into a tracked time entry** (you pick the project
at confirm time). Two providers are supported — **Google Calendar** and
**Outlook / Microsoft 365** — and a workspace may connect **both at once**, which
is the ordinary case when work and personal calendars are separate. Direction is inbound-only and read-through — the worker
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

## Providers

| | Google | Outlook / Microsoft 365 |
|---|---|---|
| Secrets | `GOOGLE_CALENDAR_CLIENT_ID` / `_SECRET` | `MICROSOFT_CALENDAR_CLIENT_ID` / `_SECRET` (+ optional `MICROSOFT_CALENDAR_TENANT`) |
| Scope | `calendar.readonly` | `Calendars.Read` |
| API | Calendar v3 `events` | Graph `me/calendar/calendarView` |
| `integrations.type` | `google_calendar` | `microsoft_calendar` |
| Connect | `/api/calendar/google/connect` | `/api/calendar/microsoft/connect` |

Each is independent: configure either, both, or neither. A provider with no
secrets set simply doesn't appear in the Settings card.

Everything downstream — ghost blocks, auto-track, the assistant's nudges, day
drafting — goes through `lib/calendar-connections.ts` and never knows which
provider an event came from.

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

## One-time Entra ID setup (Outlook / Microsoft 365)

> **Check this first if the calendar is a work account.** Many corporate tenants
> block user consent for third-party apps, so connecting may need an
> administrator to approve the app first. `Calendars.Read` is a *delegated*
> permission that reads only the signed-in user's own calendar and is not
> admin-restricted by default — but tenant policy can still require admin
> consent for any unlisted app. If consent fails with something like
> "Need admin approval", that is tenant policy, not a bug here.

1. In the [Microsoft Entra admin center](https://entra.microsoft.com/) →
   **App registrations → New registration**:
   - **Supported account types** decides who can sign in. "Accounts in this
     organizational directory only" (single tenant) is the tightest; "any
     organizational directory and personal Microsoft accounts" is the most
     permissive.
   - **Redirect URI**: platform **Web**, value
     `https://timetracker.run/api/calendar/microsoft/callback`. Add
     `http://localhost:5173/api/calendar/microsoft/callback` too for local dev —
     Entra allows `http` only for `localhost`.
2. **API permissions → Add a permission → Microsoft Graph → Delegated
   permissions** → `Calendars.Read`. (`offline_access`, `openid` and `email` are
   requested in the consent URL and need no registration.) If your tenant
   requires it, click **Grant admin consent**.
3. **Certificates & secrets → New client secret.** Copy the *Value* — it is shown
   once and is unrecoverable.
4. Note the **Application (client) ID**, and the **Directory (tenant) ID** if the
   registration is single-tenant.

Then set the secrets:

```bash
# Local dev — .dev.vars
MICROSOFT_CALENDAR_CLIENT_ID=...
MICROSOFT_CALENDAR_CLIENT_SECRET=...
MICROSOFT_CALENDAR_TENANT=common   # or your tenant id

# Production
npx wrangler secret put MICROSOFT_CALENDAR_CLIENT_ID
npx wrangler secret put MICROSOFT_CALENDAR_CLIENT_SECRET
npx wrangler secret put MICROSOFT_CALENDAR_TENANT
```

`MICROSOFT_CALENDAR_TENANT` defaults to `common`. **A single-tenant registration
must set its own tenant id** — the `common` endpoint refuses sign-ins for one,
with `AADSTS50194`.

### Two Microsoft-specific traps

- **Refresh tokens rotate.** Microsoft may return a *new* refresh token on every
  refresh and retire the old one; Google does not. `ensureAccessToken` persists
  the rotation, and `accessTokenFor` writes it back. Skipping that appears to
  work for an hour and then breaks with `invalid_grant` days later.
- **Graph returns local-naive timestamps** — `"2026-08-24T16:00:00.0000000"` with
  the zone in a sibling field, so they are not parseable as-is. The client asks
  for UTC via `Prefer: outlook.timezone="UTC"` and stamps the `Z` itself.
  Without that, every event is shifted by the server's idea of local time —
  which on a Worker is UTC, so it would look correct in exactly the environment
  where it is tested and be wrong for every user west of it.

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
  entries by the cron without any clicking. The assistant's nudges also surface untracked
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

| Concern | Where |
|---|---|
| Provider shapes + registry | `src/worker/lib/calendar-providers.ts` |
| Google OAuth + Calendar v3 | `src/worker/lib/google-calendar.ts` |
| Microsoft OAuth + Graph | `src/worker/lib/microsoft-calendar.ts` |
| Loading/refreshing connections, merged reads | `src/worker/lib/calendar-connections.ts` |
| Connect/callback/status/disconnect routes | `src/worker/routes/calendar.ts` |
| Auto-track + range convert | `src/worker/lib/calendar-autotrack.ts` |
| Settings card | `src/react-app/components/settings/CalendarSyncCard.tsx` |
| Tests | `e2e/calendar-providers.spec.ts` |

Tokens are encrypted at rest with AES-GCM keyed by `AUTH_SECRET`
(`src/worker/lib/crypto.ts`) in `integrations.credentials`, one row per provider
per workspace.
