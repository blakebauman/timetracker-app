// Days off: PTO, bank holidays and half days. Everything that assumes "a
// weekday is a working day" asks here first — pacing's working-day counts, the
// empty-timesheet nudge, the morning digest, Plan my day and day drafting.
//
// Dates are local YYYY-MM-DD strings supplied by (or derived from an offset the
// caller supplied for) the user; the worker never decides which day is today.

import type { DayOff, DayOffPortion } from "@timetracker/core/schemas";
import type { WorkingHours } from "./day-plan";

/** Local date → which part of it is off. Weekend dates are kept but never matter. */
export type DaysOffMap = ReadonlyMap<string, DayOffPortion>;

export const NO_DAYS_OFF: DaysOffMap = new Map();

/** Share of a working day that is off: a half day still counts half. */
export function offWeight(portion: DayOffPortion | undefined): number {
  if (!portion) return 0;
  return portion === "full" ? 1 : 0.5;
}

/**
 * The part of the working day that's still worked, or null when none of it is.
 * "am" off means the morning is off, so the day starts at the midpoint.
 */
export function workedHours(hours: WorkingHours, portion: DayOffPortion | undefined): WorkingHours | null {
  if (!portion) return hours;
  if (portion === "full") return null;
  // Rounded to the quarter hour the plan grid places blocks on.
  const mid = Math.round((hours.start + hours.end) / 2 / 15) * 15;
  return portion === "am" ? { start: mid, end: hours.end } : { start: hours.start, end: mid };
}

/** Weekdays (Mon–Fri) in [from, to], inclusive, as local YYYY-MM-DD strings. */
export function weekdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= end; d += 86_400_000) {
    const weekday = new Date(d).getUTCDay();
    if (weekday >= 1 && weekday <= 5) out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

function format(row: Record<string, unknown>): DayOff {
  return {
    id: row.id as string,
    date: row.date as string,
    portion: row.portion as DayOffPortion,
    label: (row.label as string) ?? "",
  };
}

/** A user's days off on or after `from` (and on or before `to`, when given), oldest first. */
export async function listDaysOff(
  db: D1Database,
  workspaceId: string,
  userId: string,
  from: string,
  to?: string
): Promise<DayOff[]> {
  const { results } = await db
    .prepare(
      `SELECT id, date, portion, label FROM days_off
       WHERE workspace_id = ?1 AND user_id = ?2 AND date >= ?3 AND (?4 IS NULL OR date <= ?4)
       ORDER BY date ASC`
    )
    .bind(workspaceId, userId, from, to ?? null)
    .all<Record<string, unknown>>();
  return results.map(format);
}

/** The same rows as a date-keyed map, for the computations that only need to ask "is this day off?". */
export async function loadDaysOff(
  db: D1Database,
  workspaceId: string,
  userId: string,
  from: string,
  to?: string
): Promise<DaysOffMap> {
  const rows = await listDaysOff(db, workspaceId, userId, from, to);
  return new Map(rows.map((r) => [r.date, r.portion]));
}

/** One day's portion off, or undefined when it's a normal day. */
export async function loadDayOff(
  db: D1Database,
  workspaceId: string,
  userId: string,
  date: string
): Promise<DayOffPortion | undefined> {
  return (await loadDaysOff(db, workspaceId, userId, date, date)).get(date);
}
