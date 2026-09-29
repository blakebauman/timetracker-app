import {
  addLocalDays,
  compareLocalDates,
  localWeekday,
  todayLocalDate,
} from "@timetracker/core/task-recurrence";
import type { Task } from "@timetracker/core/schemas";

// ─── Priority ────────────────────────────────────────────────────────────────

/**
 * Only P1 and P2 carry colour.
 *
 * Priority renders as a tint on the done-toggle's ring — the element already at
 * the row's leading edge, which is both where the eye lands and the one spot
 * that isn't a `border-left` accent stripe (a named ban in DESIGN.md §8).
 * Letting all four levels colour it would put a saturated marker on every row
 * and spend the One Accent Rule on decoration; P3 and P4 stay neutral, and P4
 * is the default, so most rows show nothing at all.
 */
export const PRIORITY_RING: Record<number, string> = {
  1: "border-destructive text-destructive",
  2: "border-warning text-warning",
  3: "border-muted-foreground/60",
  4: "border-muted-foreground/40",
};

export const PRIORITY_LABEL: Record<number, string> = {
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "None",
};

export const PRIORITIES = [1, 2, 3, 4] as const;

// ─── Due dates ───────────────────────────────────────────────────────────────

const WEEKDAY_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type DueTone = "overdue" | "today" | "soon" | "later";

export function dueTone(dueDate: string | null, today = todayLocalDate()): DueTone | null {
  if (!dueDate) return null;
  const delta = compareLocalDates(dueDate, today);
  if (delta < 0) return "overdue";
  if (delta === 0) return "today";
  return compareLocalDates(dueDate, addLocalDays(today, 7)) <= 0 ? "soon" : "later";
}

/** "Overdue" / "Today" / "Tomorrow" / "Thursday" / "12 Mar". */
export function formatDueDate(dueDate: string, today = todayLocalDate()): string {
  if (dueDate === today) return "Today";
  if (dueDate === addLocalDays(today, 1)) return "Tomorrow";
  if (dueDate === addLocalDays(today, -1)) return "Yesterday";
  // Inside the coming week a weekday name is more useful than a number — it's
  // how someone actually plans ("I'll do it Thursday").
  if (compareLocalDates(dueDate, today) > 0 && compareLocalDates(dueDate, addLocalDays(today, 7)) < 0) {
    return WEEKDAY_LONG[localWeekday(dueDate)];
  }
  const [y, m, d] = dueDate.split("-").map(Number);
  const thisYear = Number(today.slice(0, 4));
  return `${d} ${MONTHS[m - 1]}${y === thisYear ? "" : ` ${y}`}`;
}

/** Heading for one day of the Upcoming list — "Today · Mon 3 Mar". */
export function formatDueHeading(dueDate: string, today = todayLocalDate()): string {
  const [, m, d] = dueDate.split("-").map(Number);
  const rel = formatDueDate(dueDate, today);
  const abs = `${WEEKDAY_LONG[localWeekday(dueDate)].slice(0, 3)} ${d} ${MONTHS[m - 1]}`;
  // Past the week `formatDueDate` falls back to a bare "4 Oct" (or "4 Jan
  // 2027"), which isn't a relative word — prefixing it gave "4 Oct · Sun 4 Oct".
  if (rel === abs || rel.startsWith(`${d} ${MONTHS[m - 1]}`)) return abs;
  return `${rel} · ${abs}`;
}

// ─── Time of day ─────────────────────────────────────────────────────────────

/** How long a scheduled task's block is when it carries no estimate. */
export const DEFAULT_BLOCK_SECONDS = 30 * 60;

/** Minutes after midnight → "14:30" / "2:30 PM", following the time-format pref. */
export function formatMinute(minute: number, timeFormat: "24h" | "12h" = "24h"): string {
  const h = Math.floor(minute / 60);
  const m = String(minute % 60).padStart(2, "0");
  if (timeFormat === "24h") return `${String(h).padStart(2, "0")}:${m}`;
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** Minutes after midnight → the `HH:mm` a `<input type="time">` wants, and back. */
export function minuteToTimeInput(minute: number | null): string {
  return minute === null ? "" : formatMinute(minute, "24h");
}
export function timeInputToMinute(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * A scheduled task's block, in real instants: its local due day at its local
 * minute, for its estimate. Null for a task with no day or no time.
 */
export function scheduledBlock(task: Pick<Task, "dueDate" | "scheduledMinute" | "estimatedSeconds">) {
  if (!task.dueDate || task.scheduledMinute === null) return null;
  const [y, mo, d] = task.dueDate.split("-").map(Number);
  const start = new Date(y, mo - 1, d, 0, task.scheduledMinute);
  const end = new Date(start.getTime() + (task.estimatedSeconds || DEFAULT_BLOCK_SECONDS) * 1000);
  return { start, end };
}

/** Convert a local date string into a Date at local midnight (for the picker). */
export function localDateToDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dateToLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── Quick-add parsing ───────────────────────────────────────────────────────

// Quick-add parsing lives in @timetracker/core so the browser extension's
// popup reads a line exactly the way this page does.
export { parseQuickAdd, type ParsedQuickAdd } from "@timetracker/core/quick-add";

// ─── Ordering ────────────────────────────────────────────────────────────────

/**
 * Fractional index between two neighbours, so a drag rewrites **one** row.
 * `null` on either side means "the end of the list in that direction".
 */
export function midpointOrder(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/**
 * Plan order within a section: overdue first, then by due date, then priority,
 * then the manual sequence. Undated tasks sort after dated ones — an undated
 * task is explicitly *not* scheduled, so it should never outrank one that is.
 */
export function comparePlanned(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return compareLocalDates(a.dueDate, b.dueDate);
  }
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.sortOrder - b.sortOrder;
}

/**
 * Group subtasks under their parents, dropping any child whose parent isn't in
 * the same list. A subtask rendered as a top-level row loses the only context
 * that made it readable.
 */
export interface TaskNode {
  task: Task;
  children: Task[];
}

/**
 * Re-attach the subtasks of every selected parent, drawn from the full list.
 *
 * The dated views select on `due_date`, and a subtask doesn't have one — it is
 * due when its parent is. Without this a parent in Today rendered "0/3" over an
 * empty disclosure: the count said three children existed and the list showed
 * none, which reads as a broken component rather than a filter.
 */
export function withSubtasks(selected: Task[], all: Task[]): Task[] {
  const ids = new Set(selected.filter((t) => !t.parentId).map((t) => t.id));
  if (!ids.size) return selected;
  const have = new Set(selected.map((t) => t.id));
  return [
    ...selected,
    ...all.filter((t) => t.parentId && ids.has(t.parentId) && !have.has(t.id)),
  ];
}

export function nest(tasks: Task[], compare: (a: Task, b: Task) => number): TaskNode[] {
  const children = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const list = children.get(t.parentId) ?? [];
    list.push(t);
    children.set(t.parentId, list);
  }
  return tasks
    .filter((t) => !t.parentId)
    .sort(compare)
    .map((task) => ({
      task,
      children: (children.get(task.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}
