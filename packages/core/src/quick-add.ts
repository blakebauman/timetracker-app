/**
 * Quick-add: the tokens a task-capture line understands.
 *
 * Shared by the web app's capture field and the browser extension's popup, so
 * "draft report fri p1" means the same task wherever it's typed. Pure, with no
 * dependencies beyond the recurrence vocabulary it emits.
 */
import {
  addLocalDays,
  compareLocalDates,
  isLocalDate,
  localWeekday,
  todayLocalDate,
} from "./task-recurrence";

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
  /** `3pm`, `3:30pm`, `15:00` (optionally after `at`) → minutes after local midnight. */
  scheduledMinute: number | null;
  /** `by fri`, `by next week`, `by 2026-10-15` — when it must be done. */
  deadlineDate: string | null;
}

/**
 * A date expression starting at `raws[i]`: `today`, `tomorrow`, `fri`,
 * `next week`, `next month`, `in 3 days`, `3d`, or `YYYY-MM-DD`. Returns the
 * date and how many tokens it used, or null. One grammar for due dates and
 * `by …` deadlines, so the two can never disagree about what "fri" means.
 */
function parseDateAt(
  raws: string[],
  i: number,
  today: string
): { date: string; consumed: number } | null {
  const token = raws[i]?.toLowerCase();
  const next = raws[i + 1]?.toLowerCase();
  if (!token) return null;
  if (token === "today") return { date: today, consumed: 1 };
  if (token === "tomorrow" || token === "tmr") return { date: addLocalDays(today, 1), consumed: 1 };
  // "next week" is the start of next week (Monday), which is how the phrase
  // is used when planning; "next month" is the 1st.
  if (token === "next" && next === "week") return { date: nextWeekday(today, 1), consumed: 2 };
  if (token === "next" && next === "month") {
    const [y, m] = today.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return { date: `${ny}-${String(nm).padStart(2, "0")}-01`, consumed: 2 };
  }
  if (token === "in" && next && /^\d{1,3}$/.test(next)) {
    const unit = raws[i + 2]?.toLowerCase();
    if (unit && unit in UNIT_DAYS) {
      return { date: addLocalDays(today, Number(next) * UNIT_DAYS[unit]), consumed: 3 };
    }
  }
  if (token in WEEKDAY_TOKENS) {
    // The *next* such weekday, never today — "fri" typed on a Friday means
    // the coming Friday, which is the only reading that isn't ambiguous.
    return { date: nextWeekday(today, WEEKDAY_TOKENS[token]), consumed: 1 };
  }
  const rel = /^(\d{1,3})([dwm])$/.exec(token);
  if (rel) {
    const n = Number(rel[1]);
    return { date: addLocalDays(today, rel[2] === "d" ? n : rel[2] === "w" ? n * 7 : n * 30), consumed: 1 };
  }
  if (isLocalDate(token)) return { date: token, consumed: 1 };
  return null;
}

/**
 * A time of day, or null. 12-hour needs its am/pm (`3pm`, `12:30am`); 24-hour
 * needs two-digit minutes (`15:00`, `9:30`), which is what keeps a task called
 * "1:1 with Sam" from being read as 1:01.
 */
function parseTimeOfDay(token: string): number | null {
  const twelve = /^(\d{1,2})(?::([0-5]\d))?(am|pm)$/.exec(token);
  if (twelve) {
    const h = Number(twelve[1]);
    if (h < 1 || h > 12) return null;
    return ((h % 12) + (twelve[3] === "pm" ? 12 : 0)) * 60 + Number(twelve[2] ?? 0);
  }
  const twentyFour = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(token);
  if (twentyFour) return Number(twentyFour[1]) * 60 + Number(twentyFour[2]);
  return null;
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
 * Parse date, time, priority, estimate and repeat tokens out of a quick-add
 * line — `tomorrow`, `fri`, `next week`, `in 3 days`, `3d`, `3pm`, `at 15:00`,
 * `by fri` (a deadline), `p1`, `~45m`, `every mon`, `#project`.
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
  let scheduledMinute: number | null = null;
  let deadlineDate: string | null = null;

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
    if (scheduledMinute === null) {
      const at = token === "at" && next ? parseTimeOfDay(next) : null;
      if (at !== null) { scheduledMinute = at; i++; continue; }
      const time = parseTimeOfDay(token);
      if (time !== null) { scheduledMinute = time; continue; }
    }
    if (estimatedSeconds === null) {
      const est = parseEstimate(token);
      if (est !== null) { estimatedSeconds = est; continue; }
    }
    if (every === null && token === "every" && next) {
      const parsed = parseEvery(next);
      if (parsed) { every = parsed; i++; continue; }
    }
    // "by fri" is a deadline — when it must be done — not the day it's planned.
    if (deadlineDate === null && token === "by") {
      const d = parseDateAt(raws, i + 1, today);
      if (d) { deadlineDate = d.date; i += d.consumed; continue; }
    }
    if (dueDate === null) {
      const d = parseDateAt(raws, i, today);
      if (d) { dueDate = d.date; i += d.consumed - 1; continue; }
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

  // A time with no day means today — "call bank 3pm" is a plan for this
  // afternoon. Even when 3pm has passed: the row shows it overdue, which is
  // the honest reading, rather than silently moving it to tomorrow.
  if (scheduledMinute !== null) dueDate ??= today;

  return {
    name: kept.join(" ").trim(),
    dueDate,
    priority,
    projectHint,
    estimatedSeconds,
    recurRule,
    scheduledMinute,
    deadlineDate,
  };
}

