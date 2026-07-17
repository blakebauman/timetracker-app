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
  parseISO,
  differenceInSeconds,
  differenceInCalendarDays,
  getISOWeek,
  isSameMonth,
  isSameYear,
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

// Compact label for a navigable period, e.g. "Jul 14 – 20 · W29" (same month),
// "Jun 30 – Jul 6 · W27" (spans months), or with the year when the range does
// not fall in the current calendar year. The week number is the ISO week of the
// period start.
export function formatPeriodLabel(since: Date, until: Date): string {
  const week = getISOWeek(since);
  const startFmt = "MMM d";
  let range: string;
  if (isSameMonth(since, until)) {
    range = `${format(since, startFmt)} – ${format(until, "d")}`;
  } else {
    range = `${format(since, startFmt)} – ${format(until, "MMM d")}`;
  }
  if (!isSameYear(since, new Date())) {
    range += `, ${format(until, "yyyy")}`;
  }
  return `${range} · W${week}`;
}

export function formatFullDate(isoString: string): string {
  return format(parseISO(isoString), "PPP");
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

// Local YYYY-MM-DD for an ISO timestamp — the value shape <input type="date"> wants.
export function toDateInputValue(iso: string): string {
  const d = new Date(iso);
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
