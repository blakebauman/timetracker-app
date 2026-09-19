/**
 * Task recurrence — a deliberately small vocabulary, shared by the worker (which
 * spawns the next occurrence) and the client (which labels it).
 *
 *   daily          every day
 *   weekdays       Mon–Fri
 *   weekly:1,3,5   those local weekdays (0 = Sunday … 6 = Saturday)
 *   monthly:15     that day of the month, clamped to the month's length
 *
 * Not RRULE. Everything here operates on local `YYYY-MM-DD` strings, never on
 * Date instants: a task due "Friday" is due Friday everywhere, and the moment a
 * recurrence is computed from a timestamp it starts landing a day out for
 * whoever isn't on the server's clock.
 *
 * Occurrences are spawned when one is *completed*, from the completing client's
 * own local date — so there is no cron, and a recurring task nobody completes
 * simply goes overdue, which is the honest outcome.
 */

export type RecurKind = "daily" | "weekdays" | "weekly" | "monthly";

export interface ParsedRecurrence {
  kind: RecurKind;
  /** weekly: local weekdays, 0 = Sunday. Sorted, deduped, non-empty. */
  daysOfWeek: number[];
  /** monthly: day of month, 1–31. */
  dayOfMonth: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

/** Parse a stored rule. Returns null for anything unrecognised. */
export function parseRecurRule(rule: string | null | undefined): ParsedRecurrence | null {
  if (!rule) return null;
  const [kind, arg] = rule.split(":", 2);

  if (kind === "daily") return { kind: "daily", daysOfWeek: [], dayOfMonth: 1 };
  if (kind === "weekdays") return { kind: "weekdays", daysOfWeek: [1, 2, 3, 4, 5], dayOfMonth: 1 };

  if (kind === "weekly") {
    const days = [
      ...new Set(
        (arg ?? "")
          .split(",")
          .map((d) => Number.parseInt(d, 10))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      ),
    ].sort((a, b) => a - b);
    return days.length ? { kind: "weekly", daysOfWeek: days, dayOfMonth: 1 } : null;
  }

  if (kind === "monthly") {
    const day = Number.parseInt(arg ?? "", 10);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    return { kind: "monthly", daysOfWeek: [], dayOfMonth: day };
  }

  return null;
}

/** Round-trips through `parseRecurRule`; `null` for an unusable rule. */
export function normalizeRecurRule(rule: string | null | undefined): string | null {
  const parsed = parseRecurRule(rule);
  if (!parsed) return null;
  if (parsed.kind === "weekly") return `weekly:${parsed.daysOfWeek.join(",")}`;
  if (parsed.kind === "monthly") return `monthly:${parsed.dayOfMonth}`;
  return parsed.kind;
}

// ─── Local-date arithmetic (string in, string out) ───────────────────────────

function toParts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function fromParts(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Days in month `m` (1-based) of year `y`. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addLocalDays(date: string, days: number): string {
  const { y, m, d } = toParts(date);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return fromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday, for a local date string. */
export function localWeekday(date: string): number {
  const { y, m, d } = toParts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Positive if `a` is after `b`, 0 if equal, negative if before. */
export function compareLocalDates(a: string, b: string): number {
  return a === b ? 0 : a > b ? 1 : -1;
}

/** Today, in the caller's local timezone, as `YYYY-MM-DD`. */
export function todayLocalDate(now: Date = new Date()): string {
  return fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * The first occurrence strictly after `from`.
 *
 * `from` is normally the completing client's local date, so "every weekday",
 * completed on a Friday, lands on Monday.
 */
export function nextOccurrence(rule: string | null | undefined, from: string): string | null {
  const parsed = parseRecurRule(rule);
  if (!parsed || !isLocalDate(from)) return null;

  if (parsed.kind === "daily") return addLocalDays(from, 1);

  if (parsed.kind === "weekdays" || parsed.kind === "weekly") {
    const wanted = new Set(parsed.daysOfWeek);
    // At most 7 steps: the set is non-empty, so one of them must match.
    for (let i = 1; i <= 7; i++) {
      const candidate = addLocalDays(from, i);
      if (wanted.has(localWeekday(candidate))) return candidate;
    }
    return null;
  }

  // Monthly: this month's target day if it's still ahead, else next month's,
  // clamped so "the 31st" lands on the 30th / 28th rather than overflowing.
  const { y, m } = toParts(from);
  const thisMonth = fromParts(y, m, Math.min(parsed.dayOfMonth, daysInMonth(y, m)));
  if (compareLocalDates(thisMonth, from) > 0) return thisMonth;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return fromParts(ny, nm, Math.min(parsed.dayOfMonth, daysInMonth(ny, nm)));
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human label for a rule — "Every weekday", "Every Mon, Thu", "Monthly on the 15th". */
export function describeRecurRule(rule: string | null | undefined): string | null {
  const parsed = parseRecurRule(rule);
  if (!parsed) return null;
  if (parsed.kind === "daily") return "Every day";
  if (parsed.kind === "weekdays") return "Every weekday";
  if (parsed.kind === "weekly") {
    return `Every ${parsed.daysOfWeek.map((d) => WEEKDAY_NAMES[d]).join(", ")}`;
  }
  const d = parsed.dayOfMonth;
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `Monthly on the ${d}${suffix}`;
}
