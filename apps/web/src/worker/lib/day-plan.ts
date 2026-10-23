/**
 * "Plan my day": fit today's unscheduled tasks into today's free time.
 *
 * Deterministic, like pacing and the task plan. The Assistant *presents* the
 * plan and asks before applying it; the placement itself is arithmetic, so the
 * same day always produces the same proposal and nothing depends on a model
 * reasoning about minutes.
 *
 * Everything is in the user's local minutes-of-day. The caller supplies the
 * offset; the worker runs in UTC and never decides what "9am" means.
 */
import { compareLocalDates } from "@timetracker/core/task-recurrence";
import type { DayOffPortion } from "@timetracker/core/schemas";
import { loadTodayEvents } from "./assistant";
import { workedHours } from "./days-off";
import { listTasks, type TaskRecord } from "./tasks";

/**
 * The working day a plan fills when the user hasn't set their own (Settings →
 * Working hours, `user.work_start_minute` / `work_end_minute`). Drafting infers
 * its own window from the day's first and last activity.
 */
export const WORKDAY_START = 9 * 60;
export const WORKDAY_END = 17 * 60 + 30;

export interface WorkingHours {
  start: number;
  end: number;
}

/** A user's working hours, or the default window. */
export async function loadWorkingHours(db: D1Database, userId: string): Promise<WorkingHours> {
  const row = await db
    .prepare(`SELECT work_start_minute AS start, work_end_minute AS "end" FROM "user" WHERE id = ?`)
    .bind(userId)
    .first<WorkingHours>();
  return row && row.end > row.start ? row : { start: WORKDAY_START, end: WORKDAY_END };
}
/** A task with no estimate still takes a slot this long. */
export const DEFAULT_TASK_MINUTES = 30;
/** Blocks start on a quarter hour. */
const GRID = 15;

export interface Busy {
  start: number;
  end: number;
}

export interface PlanCandidate {
  id: string;
  name: string;
  priority: number;
  deadlineDate: string | null;
  dueDate: string | null;
  minutes: number;
}

export interface PlannedSlot {
  taskId: string;
  name: string;
  startMinute: number;
  minutes: number;
}

export interface DayPlan {
  localDate: string;
  placed: PlannedSlot[];
  /** Didn't fit in what's left of the working day. */
  unplaced: { taskId: string; name: string; minutes: number }[];
  /** Free minutes left in the working day before placing anything. */
  freeMinutes: number;
  /** The working hours the plan filled, so a proposal can say what it assumed. */
  workday: WorkingHours;
  /** Set when part or all of today is off; the workday above is already the part that's worked. */
  dayOff: DayOffPortion | null;
}

/** Urgent first, then the nearest deadline, then the oldest due date. */
function byImportance(a: PlanCandidate, b: PlanCandidate): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.deadlineDate !== b.deadlineDate) {
    if (!a.deadlineDate) return 1;
    if (!b.deadlineDate) return -1;
    return compareLocalDates(a.deadlineDate, b.deadlineDate);
  }
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return compareLocalDates(a.dueDate, b.dueDate);
  return a.name.localeCompare(b.name);
}

function merge(busy: Busy[]): Busy[] {
  const sorted = [...busy].filter((b) => b.end > b.start).sort((a, b) => a.start - b.start);
  const out: Busy[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out;
}

/** Free stretches inside [from, to] around the busy intervals. */
function freeStretches(busy: Busy[], from: number, to: number): Busy[] {
  const out: Busy[] = [];
  let cursor = from;
  for (const b of merge(busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= to) break;
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, to) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < to) out.push({ start: cursor, end: to });
  return out;
}

/**
 * Greedy, in importance order: each task takes the earliest free stretch long
 * enough to hold it, snapped to the quarter hour. A task never splits across
 * a meeting — a plan that says "25 minutes, meeting, 35 minutes" isn't a plan
 * anyone follows.
 */
export function placeTasks(input: {
  localDate: string;
  nowMinute: number;
  busy: Busy[];
  tasks: PlanCandidate[];
  windowStart?: number;
  windowEnd?: number;
}): Omit<DayPlan, "dayOff"> {
  const windowStart = input.windowStart ?? WORKDAY_START;
  const windowEnd = input.windowEnd ?? WORKDAY_END;
  const from = Math.max(windowStart, Math.ceil(input.nowMinute / GRID) * GRID);
  const busy = [...input.busy];
  const freeMinutes = freeStretches(busy, from, windowEnd).reduce((sum, f) => sum + (f.end - f.start), 0);

  const placed: PlannedSlot[] = [];
  const unplaced: DayPlan["unplaced"] = [];
  for (const task of [...input.tasks].sort(byImportance)) {
    const slot = freeStretches(busy, from, windowEnd)
      .map((f) => ({ start: Math.ceil(f.start / GRID) * GRID, end: f.end }))
      .find((f) => f.end - f.start >= task.minutes);
    if (!slot) {
      unplaced.push({ taskId: task.id, name: task.name, minutes: task.minutes });
      continue;
    }
    placed.push({ taskId: task.id, name: task.name, startMinute: slot.start, minutes: task.minutes });
    busy.push({ start: slot.start, end: slot.start + task.minutes });
  }
  placed.sort((a, b) => a.startMinute - b.startMinute);
  return {
    localDate: input.localDate,
    placed,
    unplaced,
    freeMinutes,
    workday: { start: windowStart, end: windowEnd },
  };
}

/** Minutes a task still needs: what's left of its estimate, or the default. */
export function remainingMinutes(t: Pick<TaskRecord, "estimatedSeconds" | "trackedSeconds">): number {
  if (!t.estimatedSeconds) return DEFAULT_TASK_MINUTES;
  const left = Math.ceil((t.estimatedSeconds - t.trackedSeconds) / 60);
  return Math.max(GRID, Math.ceil(left / GRID) * GRID);
}

/**
 * Build today's proposal: open top-level tasks due today or earlier with no
 * time yet, placed around today's calendar events and the blocks already
 * scheduled for today.
 */
export async function buildDayPlan(
  env: Env,
  workspaceId: string,
  offsetMinutes: number,
  hours: WorkingHours = { start: WORKDAY_START, end: WORKDAY_END },
  dayOff?: DayOffPortion
): Promise<DayPlan> {
  const nowMs = Date.now();
  const local = new Date(nowMs - offsetMinutes * 60_000);
  const localDate = local.toISOString().slice(0, 10);
  const nowMinute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const dayStartMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + offsetMinutes * 60_000;
  const toLocalMinute = (iso: string) => Math.round((new Date(iso).getTime() - dayStartMs) / 60_000);

  const [tasks, events] = await Promise.all([
    listTasks(env.DB, workspaceId, { dueOnOrBefore: localDate }),
    loadTodayEvents(env, workspaceId, new Date(dayStartMs).toISOString(), new Date(dayStartMs + 86_400_000).toISOString()),
  ]);

  const topLevel = tasks.filter((t) => !t.parentId);
  // A block today whose time has already passed with the task still open is a
  // plan the day went by. It needs a new slot, not to be planned around: the
  // plan column flags exactly these as "not started", and a plan that skipped
  // them left the one task that most needed rescheduling unplaced.
  const blockMinutes = (t: TaskRecord) =>
    t.estimatedSeconds ? Math.ceil(t.estimatedSeconds / 60) : DEFAULT_TASK_MINUTES;
  const passed = (t: TaskRecord) =>
    t.dueDate === localDate &&
    t.scheduledMinute !== null &&
    t.scheduledMinute + blockMinutes(t) <= nowMinute;
  const busy: Busy[] = [
    ...events.map((e) => ({ start: toLocalMinute(e.start), end: toLocalMinute(e.stop) })),
    // Blocks still ahead (or under way) today are commitments the plan works around.
    ...topLevel
      .filter((t) => t.dueDate === localDate && t.scheduledMinute !== null && !passed(t))
      .map((t) => ({ start: t.scheduledMinute!, end: t.scheduledMinute! + remainingMinutes(t) })),
  ];

  // Unscheduled — or scheduled on a day that has already gone, or at a time
  // today that has, which is the same thing as far as the rest of today is
  // concerned.
  const candidates: PlanCandidate[] = topLevel
    .filter((t) => t.scheduledMinute === null || t.dueDate !== localDate || passed(t))
    .map((t) => ({
      id: t.id,
      name: t.name,
      priority: t.priority,
      deadlineDate: t.deadlineDate,
      dueDate: t.dueDate,
      minutes: remainingMinutes(t),
    }));

  // A whole day off is an empty window: nothing is placed, everything is
  // reported as not fitting, and the caller can say why.
  const worked = workedHours(hours, dayOff) ?? { start: hours.end, end: hours.end };
  return {
    ...placeTasks({
      localDate,
      nowMinute,
      busy,
      tasks: candidates,
      windowStart: worked.start,
      windowEnd: worked.end,
    }),
    dayOff: dayOff ?? null,
  };
}
