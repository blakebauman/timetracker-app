import {
  addLocalDays,
  compareLocalDates,
  isLocalDate,
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

export interface ParsedQuickAdd {
  name: string;
  dueDate: string | null;
  priority: number | null;
  /** Matched `#project` text, lowercased — resolved against real projects by the caller. */
  projectHint: string | null;
  /** `~45m`, `~1h30m`, `~1.5h`. */
  estimatedSeconds: number | null;
  /** A stored rule (`daily`, `weekdays`, `weekly:1,3`, `monthly:15`) from `every …`. */
  recurRule: string | null;
}

const WEEKDAY_TOKENS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** The next `weekday` strictly after `from` (or on it, when `includeToday`). */
function nextWeekday(from: string, weekday: number, includeToday = false): string {
  for (let i = includeToday ? 0 : 1; i <= 7; i++) {
    const candidate = addLocalDays(from, i);
    if (localWeekday(candidate) === weekday) return candidate;
  }
  return from;
}

const UNIT_DAYS: Record<string, number> = {
  day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30,
};

/** `~45m`, `~2h`, `~1h30m`, `~1.5h` → seconds. Anything else → null. */
function parseEstimate(token: string): number | null {
  if (!token.startsWith("~")) return null;
  const body = token.slice(1);
  const decimalHours = /^(\d+(?:\.\d+)?)h$/.exec(body);
  if (decimalHours) return Math.round(Number(decimalHours[1]) * 3600) || null;
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(body);
  if (!parts || (!parts[1] && !parts[2])) return null;
  return (Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60) || null;
}

/**
 * `every …` → a recurrence, with the due date it implies. The rule vocabulary is
 * `@timetracker/core/task-recurrence`'s, nothing more: `every day`, `every
 * weekday`, `every week` / `every month` (anchored to the due date), and
 * `every mon` or `every mon,thu`. "every 2 weeks" isn't a rule the server can
 * store yet, so it isn't consumed and stays in the name — visibly unparsed
 * rather than quietly approximated.
 */
function parseEvery(
  word: string
): { kind: "daily" | "weekdays" | "week" | "month" } | { kind: "days"; days: number[] } | null {
  if (word === "day") return { kind: "daily" };
  if (word === "weekday") return { kind: "weekdays" };
  if (word === "week") return { kind: "week" };
  if (word === "month") return { kind: "month" };
  const days = word.split(",").map((w) => WEEKDAY_TOKENS[w]);
  if (days.length && days.every((d) => d !== undefined)) {
    return { kind: "days", days: [...new Set(days)].sort((a, b) => a - b) };
  }
  return null;
}

/**
 * Parse date, priority, estimate and repeat tokens out of a quick-add line —
 * `tomorrow`, `fri`, `next week`, `in 3 days`, `3d`, `p1`, `~45m`,
 * `every mon`, `#project`.
 *
 * **Deliberately deterministic, with no AI round-trip.** Capture has to be
 * instant and repeatable: the same words must always produce the same task, and
 * a model that is usually right is a worse trade here than a small vocabulary
 * that is always right. The same reasoning keeps AI out of `lib/pacing.ts`. The
 * AI path already exists for *entries* (`/api/ai/quick-entry`) where the input
 * is a free-form sentence rather than a line the user is typing by muscle memory.
 */
export function parseQuickAdd(input: string, today = todayLocalDate()): ParsedQuickAdd {
  let dueDate: string | null = null;
  let priority: number | null = null;
  let projectHint: string | null = null;
  let estimatedSeconds: number | null = null;
  let every: ReturnType<typeof parseEvery> = null;

  const raws = input.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    const token = raw.toLowerCase();
    const next = raws[i + 1]?.toLowerCase();

    // Only the *first* match of each kind wins, so a task literally named
    // "review p1 findings" keeps its second "p1" as text.
    if (priority === null && /^p[1-4]$/.test(token)) {
      priority = Number(token[1]);
      continue;
    }
    if (estimatedSeconds === null) {
      const est = parseEstimate(token);
      if (est !== null) { estimatedSeconds = est; continue; }
    }
    if (every === null && token === "every" && next) {
      const parsed = parseEvery(next);
      if (parsed) { every = parsed; i++; continue; }
    }
    if (dueDate === null) {
      if (token === "today") { dueDate = today; continue; }
      if (token === "tomorrow" || token === "tmr") { dueDate = addLocalDays(today, 1); continue; }
      // "next week" is the start of next week (Monday), which is how the phrase
      // is used when planning; "next month" is the 1st.
      if (token === "next" && next === "week") {
        dueDate = nextWeekday(today, 1);
        i++;
        continue;
      }
      if (token === "next" && next === "month") {
        const [y, m] = today.split("-").map(Number);
        const ny = m === 12 ? y + 1 : y;
        const nm = m === 12 ? 1 : m + 1;
        dueDate = `${ny}-${String(nm).padStart(2, "0")}-01`;
        i++;
        continue;
      }
      if (token === "in" && next && /^\d{1,3}$/.test(next)) {
        const unit = raws[i + 2]?.toLowerCase();
        if (unit && unit in UNIT_DAYS) {
          dueDate = addLocalDays(today, Number(next) * UNIT_DAYS[unit]);
          i += 2;
          continue;
        }
      }
      if (token in WEEKDAY_TOKENS) {
        // The *next* such weekday, never today — "fri" typed on a Friday means
        // the coming Friday, which is the only reading that isn't ambiguous.
        dueDate = nextWeekday(today, WEEKDAY_TOKENS[token]);
        continue;
      }
      const rel = /^(\d{1,3})([dwm])$/.exec(token);
      if (rel) {
        const n = Number(rel[1]);
        dueDate = addLocalDays(today, rel[2] === "d" ? n : rel[2] === "w" ? n * 7 : n * 30);
        continue;
      }
      if (isLocalDate(token)) { dueDate = token; continue; }
    }
    if (projectHint === null && token.startsWith("#") && token.length > 1) {
      projectHint = token.slice(1);
      continue;
    }
    kept.push(raw);
  }

  // A repeat needs a first occurrence. With no date typed, it's the first day
  // the rule lands on from today (today included — "every day" added this
  // morning is due this morning); "every week"/"every month" hang off whatever
  // due date results.
  let recurRule: string | null = null;
  if (every) {
    if (every.kind === "daily") {
      recurRule = "daily";
      dueDate ??= today;
    } else if (every.kind === "weekdays") {
      recurRule = "weekdays";
      if (!dueDate) {
        const dow = localWeekday(today);
        dueDate = dow === 0 ? addLocalDays(today, 1) : dow === 6 ? addLocalDays(today, 2) : today;
      }
    } else if (every.kind === "days") {
      recurRule = `weekly:${every.days.join(",")}`;
      if (!dueDate) {
        dueDate = every.days
          .map((d) => nextWeekday(today, d, true))
          .sort((a, b) => compareLocalDates(a, b))[0];
      }
    } else {
      dueDate ??= today;
      recurRule =
        every.kind === "week"
          ? `weekly:${localWeekday(dueDate)}`
          : `monthly:${Number(dueDate.slice(8, 10))}`;
    }
  }

  return { name: kept.join(" ").trim(), dueDate, priority, projectHint, estimatedSeconds, recurRule };
}

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
