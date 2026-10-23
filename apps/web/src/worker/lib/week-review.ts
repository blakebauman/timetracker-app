// Closing a week: the pass over a week's entries before its hours are copied
// into another system (a corporate timesheet, an engagement-code portal).
//
// Deterministic, like pacing: every flag is arithmetic over the entries, the
// user's working hours and their days off, so the same week always reads the
// same. Closing stores a snapshot of hours per project per day; a later edit —
// from any path, including auto-track, the Assistant and MCP — then shows up
// as a change against what was submitted, rather than drifting silently.
//
// Local dates come from the caller (a week-start date plus the browser's
// offset); the worker never decides which week is "this week".

import type {
  WeekChange,
  WeekDayFlag,
  WeekReview,
  WeekReviewDay,
  WeekReviewRow,
} from "@timetracker/core/schemas";
import { loadDaysOff, offWeight } from "./days-off";
import { loadWorkingHours } from "./day-plan";

const DAY_MS = 86_400_000;
/** A settled working day below this share of its expected hours is worth a look. */
const SHORT_RATIO = 0.75;
/** Over expected by more than this is a long day — probably a timer left running. */
const LONG_MARGIN_SECONDS = 2 * 3600;
/** Differences under a minute are rounding, not edits. */
const CHANGE_TOLERANCE_SECONDS = 60;

interface EntryRow {
  start: string;
  stop: string | null;
  duration: number | null;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  client_name: string | null;
}

type Snapshot = Record<string, { name: string; perDay: number[] }>;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Overlapping seconds among one day's completed entries (time counted twice). */
function overlapOf(entries: { startMs: number; stopMs: number }[]): { seconds: number; count: number } {
  const sorted = [...entries].sort((a, b) => a.startMs - b.startMs);
  let seconds = 0;
  let count = 0;
  let reach = -Infinity;
  for (const e of sorted) {
    if (e.startMs < reach) {
      seconds += (Math.min(reach, e.stopMs) - e.startMs) / 1000;
      count++;
    }
    reach = Math.max(reach, e.stopMs);
  }
  return { seconds: Math.round(seconds), count };
}

function snapshotOf(rows: WeekReviewRow[]): Snapshot {
  return Object.fromEntries(rows.map((r) => [r.projectId ?? "", { name: r.name, perDay: r.perDay }]));
}

/** Every cell whose hours moved since the snapshot, in day then project order. */
export function diffSnapshot(before: Snapshot, after: Snapshot, days: string[]): WeekChange[] {
  const changes: WeekChange[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  days.forEach((date, i) => {
    for (const key of keys) {
      const was = before[key]?.perDay[i] ?? 0;
      const now = after[key]?.perDay[i] ?? 0;
      if (Math.abs(now - was) >= CHANGE_TOLERANCE_SECONDS) {
        changes.push({
          projectId: key || null,
          name: after[key]?.name ?? before[key]?.name ?? "No project",
          date,
          beforeSeconds: was,
          afterSeconds: now,
        });
      }
    }
  });
  return changes;
}

export async function buildWeekReview(
  env: Env,
  workspaceId: string,
  userId: string,
  weekStart: string,
  offsetMinutes: number,
  nowMs: number = Date.now()
): Promise<WeekReview> {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const startMs = Date.parse(`${weekStart}T00:00:00Z`) + offsetMinutes * 60_000;
  const sinceIso = new Date(startMs).toISOString();
  const untilIso = new Date(startMs + 7 * DAY_MS).toISOString();
  const localDateOf = (ms: number) => new Date(ms - offsetMinutes * 60_000).toISOString().slice(0, 10);

  const [entriesRes, draftsRes, closure, daysOff, hours] = await Promise.all([
    env.DB.prepare(
      `SELECT te.start, te.stop, te.duration, te.project_id,
              p.name AS project_name, p.color AS project_color, c.name AS client_name
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id AND p.workspace_id = te.workspace_id
       LEFT JOIN clients c ON c.id = p.client_id AND c.workspace_id = te.workspace_id
       WHERE te.workspace_id = ? AND te.start >= ? AND te.start < ?
       ORDER BY te.start ASC`
    )
      .bind(workspaceId, sinceIso, untilIso)
      .all<EntryRow>(),
    env.DB.prepare(
      `SELECT local_date, COUNT(*) AS n FROM draft_entries
       WHERE workspace_id = ? AND user_id = ? AND local_date >= ? AND local_date <= ?
       GROUP BY local_date`
    )
      .bind(workspaceId, userId, days[0], days[6])
      .all<{ local_date: string; n: number }>(),
    env.DB.prepare(
      `SELECT closed_at, total_seconds, snapshot FROM week_closures
       WHERE workspace_id = ? AND user_id = ? AND week_start = ?`
    )
      .bind(workspaceId, userId, weekStart)
      .first<{ closed_at: string; total_seconds: number; snapshot: string }>(),
    loadDaysOff(env.DB, workspaceId, userId, days[0], days[6]),
    loadWorkingHours(env.DB, userId),
  ]);

  const draftsByDay = new Map(draftsRes.results.map((r) => [r.local_date, r.n]));
  const today = localDateOf(nowMs);
  const local = new Date(nowMs - offsetMinutes * 60_000);
  const nowMinute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const workdaySeconds = (hours.end - hours.start) * 60;

  // Rows: one per project (and one for time with no project), seconds per day.
  const rowsByKey = new Map<string, WeekReviewRow>();
  const perDayEntries = days.map(() => [] as { startMs: number; stopMs: number; projectId: string | null }[]);
  const running = new Set<string>();
  for (const e of entriesRes.results) {
    const startMs = Date.parse(e.start);
    const i = days.indexOf(localDateOf(startMs));
    if (i < 0) continue;
    if (e.stop === null) {
      running.add(days[i]);
      continue;
    }
    const seconds = e.duration ?? Math.round((Date.parse(e.stop) - startMs) / 1000);
    perDayEntries[i].push({ startMs, stopMs: Date.parse(e.stop), projectId: e.project_id });
    const key = e.project_id ?? "";
    let row = rowsByKey.get(key);
    if (!row) {
      row = {
        projectId: e.project_id,
        name: e.project_name ?? "No project",
        color: e.project_color,
        clientName: e.client_name,
        perDay: days.map(() => 0),
        totalSeconds: 0,
      };
      rowsByKey.set(key, row);
    }
    row.perDay[i] += seconds;
    row.totalSeconds += seconds;
  }
  // Largest first, with unassigned time last: it's the row that needs fixing,
  // not one to copy.
  const rows = [...rowsByKey.values()].sort(
    (a, b) =>
      Number(a.projectId === null) - Number(b.projectId === null) ||
      b.totalSeconds - a.totalSeconds ||
      a.name.localeCompare(b.name)
  );

  const reviewDays: WeekReviewDay[] = days.map((date, i) => {
    const portion = daysOff.get(date) ?? null;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const isWeekday = weekday >= 1 && weekday <= 5;
    const expectedSeconds = isWeekday ? Math.round(workdaySeconds * (1 - offWeight(portion ?? undefined))) : 0;
    const trackedSeconds = rows.reduce((sum, r) => sum + r.perDay[i], 0);
    const settled = date < today || (date === today && nowMinute >= hours.end);

    const flags: WeekDayFlag[] = [];
    if (running.has(date)) flags.push({ kind: "running" });
    const drafts = draftsByDay.get(date) ?? 0;
    if (drafts > 0) flags.push({ kind: "drafts", count: drafts });
    const overlap = overlapOf(perDayEntries[i]);
    if (overlap.count > 0) flags.push({ kind: "overlap", ...overlap });
    const unassigned = perDayEntries[i].filter((e) => e.projectId === null);
    if (unassigned.length > 0) {
      flags.push({ kind: "no_project", seconds: rowsByKey.get("")?.perDay[i] ?? 0, count: unassigned.length });
    }
    if (expectedSeconds === 0 && trackedSeconds > 0) {
      // Logged on a weekend or a booked day off — fine if intended, worth a glance if not.
      flags.push({ kind: "off_day_work", trackedSeconds });
    } else if (expectedSeconds > 0 && trackedSeconds > expectedSeconds + LONG_MARGIN_SECONDS) {
      flags.push({ kind: "long", trackedSeconds, expectedSeconds });
    } else if (settled && expectedSeconds > 0 && trackedSeconds < expectedSeconds * SHORT_RATIO) {
      flags.push({ kind: "short", trackedSeconds, expectedSeconds });
    }

    return { date, trackedSeconds, expectedSeconds, dayOff: portion, settled, flags };
  });

  let closed: WeekReview["closure"] = null;
  if (closure) {
    let before: Snapshot = {};
    try {
      before = JSON.parse(closure.snapshot) as Snapshot;
    } catch {
      // An unreadable snapshot reads as "everything changed", which is the safe side.
    }
    closed = {
      closedAt: closure.closed_at,
      totalSeconds: closure.total_seconds,
      changes: diffSnapshot(before, snapshotOf(rows), days),
    };
  }

  return {
    weekStart,
    days: reviewDays,
    rows,
    totalSeconds: rows.reduce((sum, r) => sum + r.totalSeconds, 0),
    expectedSeconds: reviewDays.reduce((sum, d) => sum + d.expectedSeconds, 0),
    closure: closed,
  };
}

/** Close (or re-close, after corrections) a week: snapshot its hours as they stand now. */
export async function closeWeek(
  env: Env,
  workspaceId: string,
  userId: string,
  weekStart: string,
  offsetMinutes: number
): Promise<WeekReview> {
  const review = await buildWeekReview(env, workspaceId, userId, weekStart, offsetMinutes);
  const closedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO week_closures (id, workspace_id, user_id, week_start, total_seconds, snapshot, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (workspace_id, user_id, week_start)
     DO UPDATE SET total_seconds = excluded.total_seconds, snapshot = excluded.snapshot,
                   closed_at = excluded.closed_at`
  )
    .bind(
      crypto.randomUUID(),
      workspaceId,
      userId,
      weekStart,
      review.totalSeconds,
      JSON.stringify(snapshotOf(review.rows)),
      closedAt
    )
    .run();
  return {
    ...review,
    closure: { closedAt, totalSeconds: review.totalSeconds, changes: [] },
  };
}
