import {
  format,
  formatDuration,
  intervalToDuration,
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
  parseISO,
  differenceInSeconds,
} from "date-fns";

export function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDurationShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDurationHuman(seconds: number): string {
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  return (
    formatDuration(duration, {
      format: ["hours", "minutes"],
      zero: true,
      delimiter: " ",
    }) || "0 minutes"
  );
}

export function getTimeFormat(): "24h" | "12h" {
  return localStorage.getItem("pref_timeFormat") === "12h" ? "12h" : "24h";
}

export function formatEntryTime(isoString: string): string {
  const pattern = getTimeFormat() === "12h" ? "h:mm a" : "HH:mm";
  return format(parseISO(isoString), pattern);
}

export function formatDayHeader(isoString: string): string {
  const date = parseISO(isoString);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

export function formatFullDate(isoString: string): string {
  return format(parseISO(isoString), "PPP");
}

export function formatShortDate(isoString: string): string {
  return format(parseISO(isoString), "MMM d");
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

export {
  format,
  parseISO,
  isToday,
  isYesterday,
  startOfDay,
  endOfDay,
  subDays,
};
