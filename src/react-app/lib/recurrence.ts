// Recurring-entry schedules are stored in UTC (so the Cron comparison is a plain
// UTC check). The user thinks in their local weekday + time, so we convert here.
// Conversion uses the browser's current tz offset; DST drift between save and
// materialization is accepted for v1 (bounded by one hour).

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const mod = (n: number, m: number) => ((n % m) + m) % m;

// Local weekday set + local minutes-of-day → UTC weekday set + UTC minutes.
export function localScheduleToUtc(
  localDays: number[],
  localMinutes: number
): { daysOfWeek: number[]; timeUtcMinutes: number } {
  const offset = new Date().getTimezoneOffset(); // UTC = local + offset (minutes)
  const rawUtc = localMinutes + offset;
  const dayShift = Math.floor(rawUtc / 1440);
  const timeUtcMinutes = mod(rawUtc, 1440);
  const daysOfWeek = [...new Set(localDays.map((d) => mod(d + dayShift, 7)))].sort(
    (a, b) => a - b
  );
  return { daysOfWeek, timeUtcMinutes };
}

// UTC weekday set + UTC minutes → local weekday set + local minutes-of-day.
export function utcScheduleToLocal(
  utcDays: number[],
  timeUtcMinutes: number
): { days: number[]; minutes: number } {
  const offset = new Date().getTimezoneOffset();
  const rawLocal = timeUtcMinutes - offset;
  const dayShift = Math.floor(rawLocal / 1440);
  const minutes = mod(rawLocal, 1440);
  const days = [...new Set(utcDays.map((d) => mod(d + dayShift, 7)))].sort((a, b) => a - b);
  return { days, minutes };
}

export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function dayLabel(day: number, full = false): string {
  return (full ? DAY_LABELS_FULL : DAY_LABELS)[mod(day, 7)] ?? "";
}

// "Mon, Wed, Fri" — compact summary of a local weekday set.
export function formatDays(days: number[]): string {
  if (days.length === 7) return "Every day";
  const weekdays = [1, 2, 3, 4, 5];
  if (days.length === 5 && weekdays.every((d) => days.includes(d))) return "Weekdays";
  return [...days].sort((a, b) => a - b).map((d) => dayLabel(d)).join(", ");
}
