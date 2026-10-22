import type { Task, TimeEntry } from "@timetracker/core/schemas";
import { compareLocalDates } from "@timetracker/core/task-recurrence";
import { comparePlanned, scheduledBlock } from "@/lib/taskUtils";

/**
 * Where the actual has passed the plan by. Deterministic and client-side, like
 * pacing: it is computed from the task and today's entries alone, and the
 * browser is the only place that knows the user's clock.
 *
 * - **missed** — today's scheduled block has ended and nothing was tracked
 *   against the task (or a subtask) from the block's start onwards.
 * - **over** — the task's tracked time has run past its estimate while it is
 *   still open.
 *
 * Every flag carries a key that names the plan it describes, so dismissing one
 * is remembered for *that* plan only: re-schedule the block or re-estimate the
 * task and a fresh mark can appear. Acting on it (starting, logging, moving
 * the block) clears it without a dismissal, because the condition stops being
 * true.
 */
export type PlanFlag =
  | { kind: "missed"; key: string; start: Date; end: Date }
  | { kind: "over"; key: string; overSeconds: number };

export interface PlanContext {
  now: number;
  today: string;
  /** Today's entries, the running one included when it is in the query. */
  entries: TimeEntry[];
  /** The running entry from the timer store, which the day query may not have yet. */
  runningEntry: TimeEntry | null;
  /** Task id → its subtask ids, so work logged on a subtask counts for the parent. */
  childrenOf: Map<string, string[]>;
  dismissed: ReadonlySet<string>;
}

export function planFlag(task: Task, ctx: PlanContext): PlanFlag | null {
  if (!task.active) return null;

  const block = scheduledBlock(task);
  if (block && task.dueDate === ctx.today && block.end.getTime() <= ctx.now) {
    const ids = new Set([task.id, ...(ctx.childrenOf.get(task.id) ?? [])]);
    const from = block.start.getTime();
    const worked = (e: TimeEntry) =>
      e.taskId !== null &&
      ids.has(e.taskId) &&
      (e.stop ? new Date(e.stop).getTime() : ctx.now) > from;
    const touched =
      ctx.entries.some(worked) || (ctx.runningEntry !== null && worked(ctx.runningEntry));
    const key = `missed:${task.id}:${task.dueDate}:${task.scheduledMinute}`;
    if (!touched && !ctx.dismissed.has(key)) {
      return { kind: "missed", key, start: block.start, end: block.end };
    }
  }

  const estimate = task.estimatedSeconds;
  if (estimate && task.trackedSeconds > estimate) {
    const key = `over:${task.id}:${estimate}`;
    if (!ctx.dismissed.has(key)) {
      return { kind: "over", key, overSeconds: task.trackedSeconds - estimate };
    }
  }
  return null;
}

/** Task id → subtask ids, from one pass over the list. */
export function childrenIndex(tasks: Task[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const list = map.get(t.parentId);
    if (list) list.push(t.id);
    else map.set(t.parentId, [t.id]);
  }
  return map;
}

/**
 * What the plan says comes next: the scheduled block that is on now or starts
 * soonest today, else the first of today's (and overdue) tasks in plan order.
 * A block that has already ended is skipped — that one is flagged in the plan
 * column, and offering it as "next" would hide that it was missed.
 */
export function pickNextTask(tasks: Task[], today: string, now = Date.now()): Task | null {
  const open = tasks.filter((t) => t.active && !t.parentId && t.dueDate);
  const scheduled = open
    .filter((t) => t.dueDate === today && t.scheduledMinute !== null)
    .map((t) => ({ t, block: scheduledBlock(t)! }))
    .filter(({ block }) => block.end.getTime() > now)
    .sort((a, b) => a.block.start.getTime() - b.block.start.getTime());
  if (scheduled.length) return scheduled[0].t;
  const unscheduled = open
    .filter((t) => t.scheduledMinute === null && compareLocalDates(t.dueDate!, today) <= 0)
    .sort(comparePlanned);
  return unscheduled[0] ?? null;
}
