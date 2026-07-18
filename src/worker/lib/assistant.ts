// Aski, the assistant: deterministic "nudge" computation plus the grounding
// context for its chat endpoint. Nudges are derived from the user's calendar
// (via the same read-through as routes/calendar.ts), today's entries, and the
// running timer — no AI involved, so they're cheap to poll. Chat is the AI
// half, grounded in the same facts (see routes/assistant.ts).

import type { AssistantNudge } from "@shared/schemas";
import { encryptJSON } from "./crypto";
import { ensureAccessToken, listEvents, type ExternalEvent } from "./google-calendar";
import { loadGoogleConnection } from "./calendar-autotrack";

// How far ahead a meeting can be and still get a "starts soon" nudge.
const SOON_WINDOW_MS = 15 * 60 * 1000;
// A running timer older than this is probably forgotten.
const LONG_TIMER_MS = 4 * 60 * 60 * 1000;
// Local hour after which an empty weekday timesheet earns a reminder.
const NOTHING_TRACKED_HOUR = 11;
// Events at least this long are treated as all-day blocks, not meetings.
const ALL_DAY_MS = 8 * 60 * 60 * 1000;

interface RunningEntry {
  id: string;
  description: string;
  start: string;
}

interface TodayFacts {
  running: RunningEntry | null;
  entryCount: number;
  totalSeconds: number;
  confirmedEventIds: Set<string>;
}

/** Local-day UTC bounds for a JS `Date.getTimezoneOffset()`-style offset. */
export function localDayBounds(nowMs: number, offsetMinutes: number) {
  const local = new Date(nowMs - offsetMinutes * 60_000);
  const dayStartMs =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) +
    offsetMinutes * 60_000;
  return {
    dayStartIso: new Date(dayStartMs).toISOString(),
    dayEndIso: new Date(dayStartMs + 24 * 60 * 60 * 1000).toISOString(),
    localHour: local.getUTCHours(),
    localWeekday: local.getUTCDay(), // 0=Sun … 6=Sat
    localDate: local.toISOString().slice(0, 10),
  };
}

function formatLocalTime(iso: string, offsetMinutes: number): string {
  const local = new Date(new Date(iso).getTime() - offsetMinutes * 60_000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function loadTodayFacts(
  db: D1Database,
  workspaceId: string,
  dayStartIso: string,
  dayEndIso: string
): Promise<TodayFacts> {
  const [running, totals, confirmed] = await Promise.all([
    db
      .prepare(
        `SELECT id, description, start FROM time_entries
         WHERE workspace_id = ? AND stop IS NULL LIMIT 1`
      )
      .bind(workspaceId)
      .first<RunningEntry>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(duration), 0) AS total FROM time_entries
         WHERE workspace_id = ? AND stop IS NOT NULL AND start >= ? AND start < ?`
      )
      .bind(workspaceId, dayStartIso, dayEndIso)
      .first<{ n: number; total: number }>(),
    db
      .prepare(
        `SELECT calendar_event_id FROM time_entries
         WHERE workspace_id = ? AND calendar_event_id IS NOT NULL
           AND start >= ? AND start <= ?`
      )
      .bind(workspaceId, dayStartIso, dayEndIso)
      .all<{ calendar_event_id: string }>(),
  ]);

  return {
    running: running ?? null,
    entryCount: totals?.n ?? 0,
    totalSeconds: totals?.total ?? 0,
    confirmedEventIds: new Set(confirmed.results.map((r) => r.calendar_event_id)),
  };
}

/**
 * Today's calendar events via the same read-through (with token refresh
 * persistence) as routes/calendar.ts. Returns [] when no calendar is connected
 * or Google errors — the assistant degrades to timer-only nudges.
 */
export async function loadTodayEvents(
  env: Env,
  workspaceId: string,
  dayStartIso: string,
  dayEndIso: string
): Promise<ExternalEvent[]> {
  if (!env.GOOGLE_CALENDAR_CLIENT_ID || !env.GOOGLE_CALENDAR_CLIENT_SECRET) return [];
  try {
    const conn = await loadGoogleConnection(env.DB, env.AUTH_SECRET, workspaceId);
    if (!conn) return [];
    const { accessToken, refreshed } = await ensureAccessToken(
      conn.tokens,
      env.GOOGLE_CALENDAR_CLIENT_ID,
      env.GOOGLE_CALENDAR_CLIENT_SECRET
    );
    if (refreshed) {
      const credentials = await encryptJSON(env.AUTH_SECRET, conn.tokens);
      await env.DB.prepare(`UPDATE integrations SET credentials = ? WHERE id = ?`)
        .bind(credentials, conn.id)
        .run();
    }
    const events = await listEvents({ accessToken, since: dayStartIso, until: dayEndIso });
    // Drop all-day blocks and zero-length artifacts — they aren't meetings.
    return events.filter((e) => {
      const len = new Date(e.stop).getTime() - new Date(e.start).getTime();
      return len > 0 && len < ALL_DAY_MS;
    });
  } catch {
    return [];
  }
}

/** Compute the current set of nudges for a workspace. Pure given its inputs. */
export function buildNudges(
  nowMs: number,
  offsetMinutes: number,
  facts: TodayFacts,
  events: ExternalEvent[]
): AssistantNudge[] {
  const nudges: AssistantNudge[] = [];
  const { localHour, localWeekday, localDate } = localDayBounds(nowMs, offsetMinutes);

  const untracked = events.filter((e) => !facts.confirmedEventIds.has(e.calendarEventId));

  for (const e of untracked) {
    const startMs = new Date(e.start).getTime();
    const stopMs = new Date(e.stop).getTime();
    const eventRef = {
      calendarEventId: e.calendarEventId,
      title: e.title,
      start: e.start,
      stop: e.stop,
    };

    if (stopMs <= nowMs) {
      nudges.push({
        id: `untracked_meeting:${e.calendarEventId}`,
        kind: "untracked_meeting",
        title: "Untracked meeting",
        body: `“${e.title}” (${formatLocalTime(e.start, offsetMinutes)}–${formatLocalTime(e.stop, offsetMinutes)}) isn't on your timesheet yet.`,
        event: eventRef,
      });
    } else if (startMs <= nowMs && !facts.running) {
      nudges.push({
        id: `meeting_now:${e.calendarEventId}`,
        kind: "meeting_now",
        title: "Meeting in progress",
        body: `You're in “${e.title}” right now but no timer is running.`,
        event: eventRef,
      });
    } else if (startMs > nowMs && startMs - nowMs <= SOON_WINDOW_MS) {
      nudges.push({
        id: `meeting_soon:${e.calendarEventId}`,
        kind: "meeting_soon",
        title: "Coming up",
        body: `“${e.title}” starts in ${formatDuration(startMs - nowMs)} (${formatLocalTime(e.start, offsetMinutes)}).`,
        event: eventRef,
      });
    }
  }

  if (facts.running) {
    const elapsed = nowMs - new Date(facts.running.start).getTime();
    if (elapsed > LONG_TIMER_MS) {
      nudges.push({
        id: `long_timer:${facts.running.id}`,
        kind: "long_timer",
        title: "Timer still running",
        body: `${facts.running.description ? `“${facts.running.description}”` : "Your timer"} has been running for ${formatDuration(elapsed)} — still on it?`,
        event: null,
      });
    }
  }

  const isWeekday = localWeekday >= 1 && localWeekday <= 5;
  if (isWeekday && localHour >= NOTHING_TRACKED_HOUR && facts.entryCount === 0 && !facts.running) {
    nudges.push({
      id: `nothing_tracked:${localDate}`,
      kind: "nothing_tracked",
      title: "Nothing tracked yet",
      body: "Your timesheet is empty so far today. Start a timer or log what you've been working on.",
      event: null,
    });
  }

  // Ended-meeting nudges are the most actionable — surface them first.
  const order: Record<AssistantNudge["kind"], number> = {
    meeting_now: 0,
    untracked_meeting: 1,
    meeting_soon: 2,
    long_timer: 3,
    nothing_tracked: 4,
  };
  return nudges.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 12);
}

/** Everything the nudges endpoint needs, in one call. */
export async function computeNudges(
  env: Env,
  workspaceId: string,
  offsetMinutes: number
): Promise<AssistantNudge[]> {
  const nowMs = Date.now();
  const { dayStartIso, dayEndIso } = localDayBounds(nowMs, offsetMinutes);
  const [facts, events] = await Promise.all([
    loadTodayFacts(env.DB, workspaceId, dayStartIso, dayEndIso),
    loadTodayEvents(env, workspaceId, dayStartIso, dayEndIso),
  ]);
  return buildNudges(nowMs, offsetMinutes, facts, events);
}

/**
 * Grounding block for Aski's chat: today's schedule and timesheet as plain
 * text the model can quote from without inventing anything.
 */
export async function buildAssistantContext(
  env: Env,
  workspaceId: string,
  offsetMinutes: number
): Promise<string> {
  const nowMs = Date.now();
  const { dayStartIso, dayEndIso, localDate } = localDayBounds(nowMs, offsetMinutes);

  const [facts, events, entries, projects] = await Promise.all([
    loadTodayFacts(env.DB, workspaceId, dayStartIso, dayEndIso),
    loadTodayEvents(env, workspaceId, dayStartIso, dayEndIso),
    env.DB.prepare(
      `SELECT te.description, te.start, te.stop, te.duration, te.billable, p.name AS project_name
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id
       WHERE te.workspace_id = ? AND te.stop IS NOT NULL AND te.start >= ? AND te.start < ?
       ORDER BY te.start ASC LIMIT 40`
    )
      .bind(workspaceId, dayStartIso, dayEndIso)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT name FROM projects WHERE workspace_id = ? AND active = 1 ORDER BY name ASC LIMIT 50`
    )
      .bind(workspaceId)
      .all<{ name: string }>(),
  ]);

  const t = (iso: string) => formatLocalTime(iso, offsetMinutes);
  const nowLocal = formatLocalTime(new Date(nowMs).toISOString(), offsetMinutes);

  const entryLines = entries.results.length
    ? entries.results
        .map((e) => {
          const hours = (((e.duration as number) ?? 0) / 3600).toFixed(2);
          return `- ${t(e.start as string)}–${t(e.stop as string)} | ${(e.project_name as string) ?? "No project"} | ${hours}h | ${e.billable ? "billable" : "non-billable"} | ${(e.description as string) || "(no description)"}`;
        })
        .join("\n")
    : "(none yet)";

  const eventLines = events.length
    ? events
        .slice(0, 20)
        .map((e) => {
          const tracked = facts.confirmedEventIds.has(e.calendarEventId);
          const state =
            new Date(e.stop).getTime() <= nowMs
              ? tracked
                ? "ended, tracked"
                : "ended, NOT tracked"
              : new Date(e.start).getTime() <= nowMs
                ? "happening now"
                : "upcoming";
          return `- ${t(e.start)}–${t(e.stop)} | ${e.title} | ${state}`;
        })
        .join("\n")
    : "(no calendar events today, or no calendar connected)";

  const runningLine = facts.running
    ? `"${facts.running.description || "(no description)"}" — started ${t(facts.running.start)}, running for ${formatDuration(nowMs - new Date(facts.running.start).getTime())}`
    : "(none)";

  return `Local date: ${localDate}, local time now: ${nowLocal}.

Running timer: ${runningLine}

Today's completed time entries (start–stop | project | hours | billing | description):
${entryLines}
Total tracked today: ${(facts.totalSeconds / 3600).toFixed(2)}h across ${facts.entryCount} entries.

Today's calendar events (start–stop | title | status):
${eventLines}

Active projects: ${projects.results.map((p) => p.name).join(", ") || "(none)"}`;
}
