// The assistant: deterministic "nudge" computation plus the grounding
// context for its chat endpoint. Nudges are derived from the user's calendar
// (via the same read-through as routes/calendar.ts), today's entries, and the
// running timer — no AI involved, so they're cheap to poll. Chat is the AI
// half, grounded in the same facts (see routes/assistant.ts).

import type { AssistantNudge } from "@shared/schemas";
import { fetchWorkspaceEvents } from "./calendar-connections";
import type { ExternalEvent } from "./calendar-providers";
import { atRiskProjects, loadProjectPacing, type ProjectPacing } from "./pacing";

// How far ahead a meeting can be and still get a "starts soon" nudge.
const SOON_WINDOW_MS = 15 * 60 * 1000;
// A running timer older than this is probably forgotten.
const LONG_TIMER_MS = 4 * 60 * 60 * 1000;
// Local hour after which an empty weekday timesheet earns a reminder.
const NOTHING_TRACKED_HOUR = 11;
// Events at least this long are treated as all-day blocks, not meetings.
const ALL_DAY_MS = 8 * 60 * 60 * 1000;
// At most this many budget warnings at once — past two or three they stop being
// a prompt and become a wall the user learns to dismiss without reading.
const MAX_BUDGET_NUDGES = 2;

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
  /** False for a workspace that has never had a single entry. */
  hasEverTracked: boolean;
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
  const [running, totals, confirmed, everTracked] = await Promise.all([
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
    // Distinguishes "hasn't started today" from "brand-new workspace" — the
    // nothing-tracked nudge is a reminder for the former and a scolding for the
    // latter, whose first-run experience should be the app's own empty state.
    db
      .prepare(`SELECT 1 AS n FROM time_entries WHERE workspace_id = ? LIMIT 1`)
      .bind(workspaceId)
      .first<{ n: number }>(),
  ]);

  return {
    running: running ?? null,
    entryCount: totals?.n ?? 0,
    totalSeconds: totals?.total ?? 0,
    confirmedEventIds: new Set(confirmed.results.map((r) => r.calendar_event_id)),
    hasEverTracked: Boolean(everTracked),
  };
}

/**
 * Today's calendar events, across every connected calendar, via the same
 * read-through (with token refresh persistence) as routes/calendar.ts. Returns
 * [] when nothing is connected or a provider errors — the assistant degrades to
 * timer-only nudges rather than failing.
 */
export async function loadTodayEvents(
  env: Env,
  workspaceId: string,
  dayStartIso: string,
  dayEndIso: string
): Promise<ExternalEvent[]> {
  try {
    const events = await fetchWorkspaceEvents(env, workspaceId, dayStartIso, dayEndIso);
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
  events: ExternalEvent[],
  pacing: ProjectPacing[] = []
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
  // Deliberately skipped on a workspace that has never tracked anything: the
  // first thing a new account saw was "Nothing tracked yet" plus a chatbot CTA,
  // before it had been shown how to start a timer. Let the list's own empty
  // state do the teaching; the nudge is for people with an established habit.
  if (
    isWeekday &&
    localHour >= NOTHING_TRACKED_HOUR &&
    facts.entryCount === 0 &&
    !facts.running &&
    facts.hasEverTracked
  ) {
    nudges.push({
      id: `nothing_tracked:${localDate}`,
      kind: "nothing_tracked",
      title: "Nothing tracked yet",
      body: "Your timesheet is empty so far today. Start a timer or log what you've been working on.",
      event: null,
    });
  }

  // A budget that has already blown, or is on course to, is worth knowing about
  // the week it happens rather than at invoice time. Deterministic — the numbers
  // come from lib/pacing.ts, not from a model.
  for (const p of atRiskProjects(pacing).slice(0, MAX_BUDGET_NUDGES)) {
    const budgetHours = Math.round((p.estimatedSeconds ?? 0) / 3600);
    if (p.status === "over_budget") {
      const over = formatDuration((p.trackedSeconds - (p.estimatedSeconds ?? 0)) * 1000);
      nudges.push({
        id: `budget_over:${p.projectId}`,
        kind: "budget_risk",
        title: "Over budget",
        body: `“${p.projectName}” has used ${formatDuration(p.trackedSeconds * 1000)} of its ${budgetHours}h budget — ${over} over.`,
        event: null,
      });
    } else if (p.projectedOverrunSeconds && p.projectedOverrunSeconds > 0) {
      const by = formatDuration(p.projectedOverrunSeconds * 1000);
      const left =
        p.workingDaysRemaining && p.workingDaysRemaining > 0
          ? ` with ${p.workingDaysRemaining} working ${p.workingDaysRemaining === 1 ? "day" : "days"} left`
          : "";
      nudges.push({
        id: `budget_pace:${p.projectId}`,
        kind: "budget_risk",
        title: "On pace to overrun",
        body: `At the current rate “${p.projectName}” lands about ${by} over its ${budgetHours}h budget${left}.`,
        event: null,
      });
    } else {
      const pct = Math.round((p.percentUsed ?? 0) * 100);
      nudges.push({
        id: `budget_close:${p.projectId}`,
        kind: "budget_risk",
        title: "Close to budget",
        body: `“${p.projectName}” is at ${pct}% of its ${budgetHours}h budget.`,
        event: null,
      });
    }
  }

  // Ended-meeting nudges are the most actionable — surface them first.
  const order: Record<AssistantNudge["kind"], number> = {
    meeting_now: 0,
    untracked_meeting: 1,
    meeting_soon: 2,
    long_timer: 3,
    nothing_tracked: 4,
    budget_risk: 5,
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
  const [facts, events, pacing] = await Promise.all([
    loadTodayFacts(env.DB, workspaceId, dayStartIso, dayEndIso),
    loadTodayEvents(env, workspaceId, dayStartIso, dayEndIso),
    loadProjectPacing(env.DB, workspaceId, nowMs),
  ]);
  return buildNudges(nowMs, offsetMinutes, facts, events, pacing);
}

/**
 * Grounding block for the assistant's chat: today's schedule and timesheet as plain
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
