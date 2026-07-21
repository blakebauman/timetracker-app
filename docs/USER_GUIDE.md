# Time Tracker — User Guide

Everything you can do in [timetracker.run](https://timetracker.run), organized by task. If you're new, read [Getting started](#getting-started) and [Tracking time](#tracking-time) — the rest is reference.

## Contents

- [Getting started](#getting-started)
- [Tracking time](#tracking-time)
- [The Timer workspace (views)](#the-timer-workspace-views)
- [Organizing work: clients, projects, tasks, tags](#organizing-work-clients-projects-tasks-tags)
- [Favorites & recurring entries](#favorites--recurring-entries)
- [Google Calendar sync & auto-track](#google-calendar-sync--auto-track)
- [The Assistant](#the-assistant)
- [Reports & exports](#reports--exports)
- [Productivity tools](#productivity-tools)
- [Teams & sharing a workspace](#teams--sharing-a-workspace)
- [Browser extension](#browser-extension)
- [Integrations (Workfront, Dynamics)](#integrations-workfront-dynamics)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Offline & sync behavior](#offline--sync-behavior)
- [Account & security](#account--security)
- [Settings reference](#settings-reference)

---

## Getting started

1. **Sign up** with your email — we send a one-time code or magic link, no password to invent (or use Google). A personal workspace is created for you automatically.
2. **Add a client and a project** under **Clients** and **Projects** (a project can have a billing rate — that's what turns hours into amounts in Reports).
3. **Start a timer** from the top bar: type a description, pick a project, hit the red start button.

Sign-in is passwordless: a **6-digit email code**, a **magic link**, **Google**, or a **passkey** (add one under Settings → Security for Touch ID / security-key sign-in).

## Tracking time

There are five ways to get time into your timesheet:

- **Live timer** — type a description in the top bar, pick project/task/tags/billable, press start. Press stop when done. The elapsed time of a *running* timer can be edited in place from the top bar if you started it late.
- **Manual entry** — **Add Entry** on the Timer page for time you've already spent; pick start/end or a duration.
- **AI Quick Add** — describe the entry in plain language ("45 min standup for Acme this morning, billable") and the app parses it into a real entry, matched against your actual projects and tasks. It warns you when it isn't sure about a match.
- **Timesheet grid** — the Timesheet view is a weekly grid: one row per project/task combination, type hours directly into day cells.
- **Calendar click-to-track** — with Google Calendar connected, click a "ghost" event or an untracked gap block on the calendar to convert it into an entry.

Entries support **description, project, task, tags, billable flag**, and inline editing after the fact. Suggestions based on your recent entries appear as you type a description — in both the timer bar and the manual entry form. Picking one restores the project, task, and billable flag that title is usually logged against, **plus the tags from its most recent entry** (handy for recurring meetings that get the same tags every day). In the timer bar the carried tags show as removable chips; in the entry form they land in the tag picker for editing. Bulk edit/delete is available from the entry list.

## The Timer workspace (views)

The Timer tab hosts five interchangeable views behind one shared header (date navigation, weekends toggle, zoom):

- **List** — entries grouped by day, with day totals.
- **Calendar** — a Toggl-style FullCalendar grid (week / 5-day / day / month). Real entries render as colored blocks; unconfirmed Google Calendar events show as dashed "ghosts"; **untracked gaps** between entries show as clickable "Track hh:mm–hh:mm" blocks (toggle with the gaps switch).
- **Split** — calendar + list side by side (large screens).
- **Timesheet** — the weekly hours grid.
- **Planner** — plan your week ahead of time (see below).

A **"Logged" bar** in the header shows the day's total with per-project colored segments.

## Project Planner

The **Planner** view (Timer tab, last icon in the view switcher) is a weekly grid like the Timesheet, but its cells hold **planned hours** instead of tracked time — your personal allocation per project (and optional task) per day. Plans are **per user**: teammates in the same workspace each keep their own.

- **Enter a plan** by clicking a cell and typing a duration (`4h`, `1:30`, `90m` — a bare number means minutes). Clearing a cell removes the plan.
- **Plan vs. actual**: each cell shows your planned hours with the time you actually tracked beneath. Tracked time turns **amber when it exceeds the plan**. Rows appear for anything planned *or* tracked that week, so unplanned work is visible too. Totals per day, per row, and for the week show both numbers.
- **Add row** adds a project/task combination you haven't planned or tracked yet.
- **Copy last week's plan** duplicates the previous week's allocations onto the current week (with Undo).
- **Import CSV** accepts `Date,Project,Task,Hours` rows (paste or upload). Dates are `YYYY-MM-DD`; projects/tasks are matched by name; in the Hours column a plain number means **hours** (`1.5` = 1h 30m) and `1:30` / `1h 30m` / `90m` also work. A preview flags unknown projects, bad dates, and bad durations — clean rows import, flagged ones are skipped.

## Organizing work: clients, projects, tasks, tags

- **Clients** hold contact details and notes; each client's detail page shows its projects and recent activity.
- **Projects** belong to a client (optionally), carry a **color**, an optional **billing rate**, and an optional budget. Rate × billable hours = the amounts you see in Reports.
- **Tasks** belong to projects; the Tasks page is a board-style list where you can also log time directly against a task.
- **Tags** are freeform labels; new tags automatically get a distinct color (editable later, along with renames, on the fly from any tag picker).

**Colors:** by default the app auto-assigns visually distinct colors to new projects and tags. Under Settings → Appearance you can toggle auto-assign and run **"Apply to existing"**, which uses AI to recolor your current projects sensibly (e.g. matching a project's name to a fitting hue) while keeping every color distinct.

## Favorites & recurring entries

- **Favorites** — save a description + project + task + billable combo and start it with one click from the star menu in the top bar.
- **Recurring entries** (Settings → Recurring entries) — templates like "Weekly team sync, Mondays 30 min" that materialize automatically as real entries on schedule, even while you're not in the app. Edit or pause them any time.

## Google Calendar sync & auto-track

Connect under **Settings → Calendar sync** (read-only access — the app never writes to your calendar). Once connected:

- Your events appear as dashed **ghost blocks** on the Calendar view. Click one → confirm the project → it becomes a tracked entry.
- **Auto-track** (toggle on the same Settings card): every few minutes, meetings that have *ended* are automatically turned into time entries — no clicking needed. Each event is only ever converted once.
- You can also convert a whole date range at once ("convert visible events").

Declined, cancelled, and all-day events are ignored. See [CALENDAR_SYNC.md](CALENDAR_SYNC.md) for setup details if you self-host.

## The Assistant

The Assistant is built in, reachable from the sparkle button in the top bar, the command palette, or `⌘I` / `Ctrl+I` — the panel opens with the chat input focused and suggestions that follow the page you're on.

**Nudges** — the Assistant watches for things worth acting on and surfaces them as cards (and, optionally, one-time toasts/browser notifications):

- a meeting happening **now** that you're not tracking
- a past meeting today you never tracked (with a one-click **Add to timesheet**)
- a meeting starting soon
- a timer that's been running suspiciously long
- a weekday with nothing tracked

Dismissals stick per-device. Turn nudge alerts on/off under Settings → Productivity.

**Chat** — ask the Assistant things in plain language: *"start a timer for the Acme redesign"*, *"how much did I bill this week?"*, *"log 2 hours of code review yesterday afternoon"*, *"track my 10am meeting"*. It can start/stop timers, log and delete entries, track meetings, summarize your time, and look up your projects — anything that **writes or deletes data asks for your approval first** with an in-chat confirm card.

**Memory** — tell the Assistant to remember preferences ("remember that standups are never billable") and it stores them per-workspace, using them in future conversations. Review and delete everything it knows under **Settings → Assistant memory**.

## Reports & exports

The Reports page has three tabs:

- **Summary** — totals (tracked, billable, amount, entries, avg/day), a daily bar chart, a cumulative chart, and a breakdown you can group and sub-group by **project / client / task / tag** (e.g. client → project).
- **Weekly** — hours per day nested under ISO weeks.
- **Detailed** — every entry as a row with project, client, task, tags, duration, and amount.

Everything respects the **date range picker** and filters. Other tools on this page:

- **Rounding** — round durations off / nearest / up / down to a chosen number of minutes. This preference is saved to your account.
- **Export** — CSV, Excel (.xlsx), or print/PDF via the browser's print dialog.
- **Saved reports** — save the current configuration (range, filters, grouping, rounding) under a name and reload it in one click.
- **AI summary** — draft a client-ready narrative summary of the selected period in a chosen style, from your real entries. Edit before you send it anywhere.
- A full **all-entries CSV export** lives under Settings → Data export.

Amounts come from each project's billing rate; the display currency is set under Settings → Preferences.

## Productivity tools

All under **Settings → Productivity**, all device-local, all off by default:

- **Idle detection** — if you go idle with a timer running, the app asks whether to keep, trim, or discard the idle time. Activity in any of your open sessions counts (other tabs, the PWA, another computer), and only the tab you're looking at will prompt — so working on one device won't trigger idle prompts on another.
- **Not-tracking reminders** — periodic nudge when nothing is running during your workday.
- **Pomodoro** — work/break interval timers layered on top of your tracking.
- **Browser notifications** — used by the above and by the Assistant's nudge alerts (needs one-time permission).

## Teams & sharing a workspace

Under **Settings → Team** you can invite people to your workspace by email. Invitees get an email link; accepting it (after signing up, if needed) joins them to your workspace.

- **Roles:** owner (fixed), admin, member — changeable per member from the same card.
- Everyone in a workspace shares its clients, projects, tasks, tags, and entries.
- Pending invites can be cancelled; members can be removed.

## Browser extension

A Chrome (MV3) extension mirrors the timer in your toolbar:

- **Badge** shows the running timer's elapsed time at a glance.
- **Popup** — sign in, see the running entry, start/stop.
- On **GitHub, Jira, and Linear** pages, the extension reads the current issue/PR title so a new timer's description is pre-filled with what you're actually working on. It reads nothing else, on no other sites.

Install: load `dist/extension/` unpacked (dev) or via the Chrome Web Store listing. Details in [../extension/README.md](../extension/README.md).

## Integrations (Workfront, Dynamics)

Under **Settings → Integrations** you can connect **Adobe Workfront** or **Microsoft Dynamics** and push time entries into them (for firms where the system of record isn't this app). Each integration has a **Test connection** button; pushes are explicit — nothing syncs without you asking.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette — start/stop, continue a recent entry, navigate, ask the Assistant |
| `Alt+Shift+S` | Start / stop the timer |
| `Alt+Shift+X` | Discard the running timer |
| `?` | Show the shortcut reference |

The command palette is the fastest path to almost everything — try it first.

## Offline & sync behavior

- The **running timer syncs in real time** across all your open tabs (and the extension) via a WebSocket — stop it anywhere, it stops everywhere.
- If you **go offline**, the timer keeps state locally and your changes are queued in the browser (IndexedDB), then replayed automatically when you're back online. A logged minute is never lost to a bad connection.
- Timer stop is optimistic: totals update instantly, without a visible dip while the server catches up.

## Account & security

Under **Settings → Account / Security / Danger zone**:

- **Profile** — change name, photo, verify email.
- **Passkeys** — sign in with Touch ID / security keys.
- **Connected accounts** — link/unlink Google sign-in.
- **Active sessions** — see and revoke every signed-in session.
- **Delete account** — permanent, removes your data.

## Settings reference

| Section | What's there | Where it's stored |
|---|---|---|
| Appearance | Theme (light/dark/system), auto-assign colors + AI recolor | Theme: device · colors: account |
| Keyboard shortcuts | Reference card | — |
| Data export | All-entries CSV | — |
| Preferences | Default billable, 12/24h time, currency, week start, show weekends | Billable: device · rest: account |
| Productivity | Notifications, idle detection, reminders, nudge alerts, pomodoro | Device |
| Assistant memory | Review/delete assistant memories | Workspace |
| Recurring entries | Manage templates | Workspace |
| Team | Members, roles, invites | Workspace |
| Calendar sync | Google connect/disconnect, auto-track | Workspace |
| Integrations | Workfront / Dynamics | Workspace |
| Account | Profile, email verification | Account |
| Security | Passkeys, connected accounts, sessions | Account |
| Danger zone | Delete account | — |

"Account" settings follow you across devices; "device" settings are per-browser.
