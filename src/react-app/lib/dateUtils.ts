import {
  format,
  isToday,
  isYesterday,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  subWeeks,
  subMonths,
  addDays,
  addWeeks,
  parseISO,
  differenceInSeconds,
  differenceInCalendarDays,
  getISOWeek,
  isSameMonth,
  isSameYear,
  isSameDay,
} from "date-fns";

export function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Canonical human-readable duration for all static (non-ticking) displays.
//   0            → "0m"
//   1–59s        → "49s"   (so a real sub-minute entry isn't shown as "0m")
//   <1h          → "45m"
//   exact hour   → "2h"    (drop the trailing "0m")
//   otherwise    → "2h 30m"
export function formatDurationShort(seconds: number): string {
  const total = Math.floor(seconds);
  if (total <= 0) return "0m";
  if (total < 60) return `${total}s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

// Parse a human-readable time string to seconds.
// Supports: "1h 30m", "1h30m", "1:30", "1:30:00", "90m", "2h", "45" (minutes)
export function parseTimeInput(str: string): number | null {
  const s = str.trim().toLowerCase();
  if (!s) return null;

  // HH:MM or HH:MM:SS
  const colonMatch = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (colonMatch) {
    return (
      parseInt(colonMatch[1]) * 3600 +
      parseInt(colonMatch[2]) * 60 +
      (colonMatch[3] ? parseInt(colonMatch[3]) : 0)
    );
  }

  // 1h 30m, 2h, 45m, 30s (any combination)
  const durMatch = s.match(/^(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?$/);
  if (durMatch && (durMatch[1] || durMatch[2] || durMatch[3])) {
    return (
      parseInt(durMatch[1] || "0") * 3600 +
      parseInt(durMatch[2] || "0") * 60 +
      parseInt(durMatch[3] || "0")
    );
  }

  // Plain number → treat as minutes
  if (/^\d+$/.test(s)) return parseInt(s) * 60;

  return null;
}

// Format seconds as a compact editable string, e.g. "1h 30m", "2h", "45m"
export function formatTimeInput(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function getTimeFormat(): "24h" | "12h" {
  return localStorage.getItem("pref_timeFormat") === "12h" ? "12h" : "24h";
}

export function formatEntryTime(isoString: string, timeFormat?: "24h" | "12h"): string {
  const pattern = (timeFormat ?? getTimeFormat()) === "12h" ? "h:mm a" : "HH:mm";
  return format(parseISO(isoString), pattern);
}

export function formatDayHeader(isoString: string): string {
  const date = parseISO(isoString);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

/**
 * True when [since, until] is exactly one calendar week for the given week start.
 * The ISO week number is only meaningful for such a range — stamping "· W29" on
 * "Last 30 days" or a rolling 7-day window says something that isn't true.
 */
export function isCalendarWeek(
  since: Date,
  until: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
): boolean {
  return (
    isSameDay(since, startOfWeek(since, { weekStartsOn })) &&
    isSameDay(until, endOfWeek(since, { weekStartsOn }))
  );
}

/**
 * Compact label for a navigable period: "Jul 14 – 20 · W29" (same month),
 * "Jun 30 – Jul 6 · W27" (spans months), plus the year when the range is not in
 * the current calendar year. A single day renders as itself, not as a range.
 *
 * `weekStamp` appends the ISO week number; pass false for any period that is not
 * exactly one calendar week (see isCalendarWeek).
 */
export function formatPeriodLabel(
  since: Date,
  until: Date,
  opts: { weekStamp?: boolean } = {}
): string {
  const { weekStamp = true } = opts;
  const week = getISOWeek(since);
  const startFmt = "MMM d";
  // A single day is its own period (the phone-width calendar). "Jul 20 – 20 · W30"
  // is a range label describing something that isn't a range.
  if (isSameDay(since, until)) {
    const day = isToday(since) ? "Today" : format(since, "EEE, MMM d");
    return isSameYear(since, new Date()) ? day : `${day}, ${format(since, "yyyy")}`;
  }
  let range: string;
  if (isSameMonth(since, until)) {
    range = `${format(since, startFmt)} – ${format(until, "d")}`;
  } else {
    range = `${format(since, startFmt)} – ${format(until, "MMM d")}`;
  }
  if (!isSameYear(since, new Date())) {
    range += `, ${format(until, "yyyy")}`;
  }
  return weekStamp ? `${range} · W${week}` : range;
}

// One date vocabulary across the app: "Mon, Jul 20". The ordinal-and-comma
// style ("July 20th, 2026") read as a third format alongside the header's
// "Jul 14 – 20" and the timesheet's day columns.
export function formatFullDate(isoString: string): string {
  const d = parseISO(isoString);
  return isSameYear(d, new Date())
    ? format(d, "EEE, MMM d")
    : format(d, "EEE, MMM d, yyyy");
}

export function formatShortDate(isoString: string): string {
  return format(parseISO(isoString), "MMM d");
}

// Format a bare "YYYY-MM-DD" date string (no time component), e.g. project
// due dates or report chart buckets. Anchors to noon to avoid the date
// shifting a day when parsed/rendered across timezone offsets.
export function formatPlainDate(dateStr: string, pattern = "MMM d, yyyy"): string {
  return format(parseISO(`${dateStr}T12:00:00`), pattern);
}

export function getDateRangePresets() {
  const now = new Date();
  return {
    today: {
      label: "Today",
      since: startOfDay(now).toISOString(),
      until: endOfDay(now).toISOString(),
    },
    yesterday: {
      label: "Yesterday",
      since: startOfDay(subDays(now, 1)).toISOString(),
      until: endOfDay(subDays(now, 1)).toISOString(),
    },
    thisWeek: {
      label: "This week",
      since: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      until: endOfWeek(now, { weekStartsOn: 1 }).toISOString(),
    },
    lastWeek: {
      label: "Last week",
      since: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }).toISOString(),
      until: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }).toISOString(),
    },
    thisMonth: {
      label: "This month",
      since: startOfMonth(now).toISOString(),
      until: endOfMonth(now).toISOString(),
    },
    lastMonth: {
      label: "Last month",
      since: startOfMonth(subMonths(now, 1)).toISOString(),
      until: endOfMonth(subMonths(now, 1)).toISOString(),
    },
    last7days: {
      label: "Last 7 days",
      since: startOfDay(subDays(now, 6)).toISOString(),
      until: endOfDay(now).toISOString(),
    },
    last30days: {
      label: "Last 30 days",
      since: startOfDay(subDays(now, 29)).toISOString(),
      until: endOfDay(now).toISOString(),
    },
  };
}

// ─── List-view date ranges ───────────────────────────────────────────────────
// The Timer *list* view scopes by an explicit user-chosen range rather than the
// navigable week the calendar/timesheet views use — a short or half-empty week
// otherwise reads as "no data" when the entries are simply a few days back.
// Unlike `getDateRangePresets` (Reports, hardcoded to Monday) these honour the
// workspace's `weekStart` preference.

export type ListRangeKey =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "last7days"
  | "last30days"
  | "thisMonth"
  | "lastMonth"
  | "custom";

export interface ResolvedListRange {
  since: Date;
  until: Date;
  label: string;
}

// Lower bound for "All dates". An unbounded floor would make the period label
// meaningless and buys nothing — no entry predates the app.
const ALL_DATES_FLOOR = new Date(2000, 0, 1);

export const LIST_RANGE_LABELS: Record<ListRangeKey, string> = {
  all: "All dates",
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  lastWeek: "Last week",
  last7days: "Last 7 days",
  last30days: "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  custom: "Custom range",
};

/**
 * Presets grouped by the unit they describe, in the order they appear in the
 * dropdown. Nine ungrouped options exceeded working memory and led with "All
 * dates" — the widest possible scope — as the first thing the eye landed on.
 *
 * Weeks come first because a week is the unit this product bills in, and "Last
 * week" sits directly under "This week" so the Monday-morning case (this week is
 * one day old) is one click away rather than six items down.
 *
 * `custom` is excluded — it renders as its own section with the two date inputs.
 */
export const LIST_RANGE_GROUPS: { label: string; keys: ListRangeKey[] }[] = [
  { label: "Weeks", keys: ["thisWeek", "lastWeek"] },
  { label: "Days", keys: ["today", "yesterday"] },
  { label: "Months", keys: ["thisMonth", "lastMonth"] },
  { label: "Rolling", keys: ["last7days", "last30days", "all"] },
];

export const LIST_RANGE_PRESETS: ListRangeKey[] = LIST_RANGE_GROUPS.flatMap(
  (g) => g.keys
);

// Resolve a stored range selection into concrete [since, until] bounds.
// `customSince`/`customUntil` are bare "YYYY-MM-DD" strings and only consulted
// for the `custom` key; a half-filled custom range falls back to today's bound
// on the missing side so the list never queries an inverted window.
export function resolveListRange(
  key: ListRangeKey,
  customSince: string | null,
  customUntil: string | null,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
): ResolvedListRange {
  const now = new Date();
  const label = LIST_RANGE_LABELS[key];

  switch (key) {
    case "all":
      return { since: ALL_DATES_FLOOR, until: endOfDay(now), label };
    case "today":
      return { since: startOfDay(now), until: endOfDay(now), label };
    case "yesterday":
      return {
        since: startOfDay(subDays(now, 1)),
        until: endOfDay(subDays(now, 1)),
        label,
      };
    case "thisWeek":
      return {
        since: startOfWeek(now, { weekStartsOn }),
        until: endOfWeek(now, { weekStartsOn }),
        label,
      };
    case "lastWeek":
      return {
        since: startOfWeek(subWeeks(now, 1), { weekStartsOn }),
        until: endOfWeek(subWeeks(now, 1), { weekStartsOn }),
        label,
      };
    case "last7days":
      return { since: startOfDay(subDays(now, 6)), until: endOfDay(now), label };
    case "last30days":
      return { since: startOfDay(subDays(now, 29)), until: endOfDay(now), label };
    case "thisMonth":
      return { since: startOfMonth(now), until: endOfMonth(now), label };
    case "lastMonth":
      return {
        since: startOfMonth(subMonths(now, 1)),
        until: endOfMonth(subMonths(now, 1)),
        label,
      };
    case "custom": {
      const since = customSince
        ? startOfDay(parseISO(`${customSince}T12:00:00`))
        : startOfDay(now);
      const until = customUntil
        ? endOfDay(parseISO(`${customUntil}T12:00:00`))
        : endOfDay(now);
      // Guard against an inverted window (user picked an end before the start).
      if (since > until) return { since: startOfDay(until), until: endOfDay(since), label };
      return { since, until, label };
    }
  }
}

// Human label for a resolved range, shown next to the picker. "All dates" has no
// meaningful span, and a single-day range reads better as "Today"/"Yesterday"
// than as a degenerate "Jul 20 – 20" span.
export function formatListRangeLabel(
  key: ListRangeKey,
  since: Date,
  until: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1
): string {
  if (key === "all") return "All dates";
  if (isSameDay(since, until)) return formatDayHeader(since.toISOString());
  // Only a real calendar week earns the "· W29" stamp.
  return formatPeriodLabel(since, until, {
    weekStamp: isCalendarWeek(since, until, weekStartsOn),
  });
}

/**
 * A short, spoken-language name for a period, for use mid-sentence:
 * "Logged this week" / "Logged Jul 14 – 20" / "Logged in June".
 *
 * Relative names ("today", "this week") are preferred when they apply, because
 * they are what a user would say out loud; anything else falls back to explicit
 * dates rather than inventing a relative name that might be off by one.
 */
export function summarizePeriod(
  since: Date,
  until: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
): string {
  const now = new Date();

  if (isSameDay(since, until)) {
    if (isToday(since)) return "today";
    if (isYesterday(since)) return "yesterday";
    return format(since, "EEE, MMM d");
  }

  if (isCalendarWeek(since, until, weekStartsOn)) {
    const thisWeek = startOfWeek(now, { weekStartsOn });
    if (isSameDay(since, thisWeek)) return "this week";
    if (isSameDay(since, startOfWeek(subWeeks(now, 1), { weekStartsOn })))
      return "last week";
    if (isSameDay(since, startOfWeek(addWeeks(now, 1), { weekStartsOn })))
      return "next week";
    return formatPeriodLabel(since, until, { weekStamp: false });
  }

  // Whole calendar month.
  if (
    isSameDay(since, startOfMonth(since)) &&
    isSameDay(until, endOfMonth(since))
  ) {
    if (isSameMonth(since, now)) return "this month";
    if (isSameMonth(since, subMonths(now, 1))) return "last month";
    return isSameYear(since, now)
      ? `in ${format(since, "MMMM")}`
      : `in ${format(since, "MMMM yyyy")}`;
  }

  return formatPeriodLabel(since, until, { weekStamp: false });
}

export function getElapsedSeconds(startIso: string): number {
  return differenceInSeconds(new Date(), parseISO(startIso));
}

// Parse a free-text time-of-day into a 24h hour/minute pair.
// Supports: "2:30 PM", "2:30pm", "14:30", "2:30" (interpreted per its own am/pm suffix,
// or as 24h when none is given).
export function parseTimeOfDayInput(str: string): { hours: number; minutes: number } | null {
  const s = str.trim().toLowerCase().replace(/\s+/g, "");

  const ampmMatch = s.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    if (hours === 12) hours = 0;
    if (ampmMatch[3] === "pm") hours += 12;
    return { hours, minutes };
  }

  const colonMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1], 10);
    const minutes = parseInt(colonMatch[2], 10);
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
  }

  return null;
}

// Set the hour/minute of an ISO timestamp, preserving its calendar date.
export function applyTimeOfDay(iso: string, hours: number, minutes: number): string {
  const d = new Date(iso);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

// Local YYYY-MM-DD for an ISO timestamp (or a Date, e.g. from a Calendar's
// onSelect) — the value shape <input type="date"> wants.
export function toDateInputValue(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Whole-day difference between an ISO timestamp's local calendar date and a
// YYYY-MM-DD target — the shift a date-picker edit represents.
export function dateDelta(iso: string, dateStr: string): number {
  const current = toDateInputValue(iso);
  if (current === dateStr) return 0;
  const [cy, cm, cd] = current.split("-").map(Number);
  const [ny, nm, nd] = dateStr.split("-").map(Number);
  return differenceInCalendarDays(new Date(ny, nm - 1, nd), new Date(cy, cm - 1, cd));
}

// Shift an ISO timestamp by a whole number of calendar days, preserving its
// time-of-day (via date-fns addDays, so DST transitions don't skew it).
export function shiftDate(iso: string, deltaDays: number): string {
  return deltaDays === 0 ? iso : addDays(new Date(iso), deltaDays).toISOString();
}

// Move an ISO timestamp to a new calendar date (YYYY-MM-DD), preserving its
// time-of-day. Only correct for a single, standalone timestamp — editing a
// start/stop PAIR (which may span midnight, landing on different calendar
// dates) needs one shared delta from dateDelta() + shiftDate() instead, or
// each field would compute its own delta and drift apart.
export function applyDate(iso: string, dateStr: string): string {
  return shiftDate(iso, dateDelta(iso, dateStr));
}

export {
  format,
  parseISO,
  isToday,
  isYesterday,
  startOfDay,
  endOfDay,
  subDays,
};
