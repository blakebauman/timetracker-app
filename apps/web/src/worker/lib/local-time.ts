// Local wall-clock time → UTC instant, for the Assistant's tools.
//
// The tools used to take UTC ISO timestamps and leave the conversion to the
// model. It got it wrong: asked to log "yesterday 2pm to 3pm" from UTC-7, it
// passed instants that landed at 06:00–07:00 local — billable time on the
// wrong part of the day, with nothing in the reply to say so. Arithmetic on
// timezones is the one thing a language model shouldn't be trusted with, so
// the model now passes the time the user said, as they said it, and this
// does the conversion.
//
// With an IANA zone the conversion follows that zone's rules for the date in
// question, so "yesterday 9am" across a DST change still lands on 9am. Without
// one (an older client) it falls back to the offset sent with the turn, which
// is right for every date on the same side of a DST change as now.

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The schema-facing pattern: `2026-10-08T14:00` — no `Z`, no offset. */
export const LOCAL_TIME_PATTERN = LOCAL_RE;
export const LOCAL_DATE_PATTERN = LOCAL_DATE_RE;

export interface UserZone {
  /** IANA zone from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`), if sent. */
  timeZone?: string | null;
  /** JS `getTimezoneOffset()` convention: minutes to add to local time to get UTC. */
  offsetMinutes: number;
}

/** Whether `timeZone` is a zone this runtime can resolve. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** `getTimezoneOffset()`-style offset of `timeZone` at the instant `ms`. */
function offsetAt(timeZone: string, ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  const atMinute = Math.floor(ms / 60_000) * 60_000;
  return Math.round((atMinute - local) / 60_000);
}

/** A wall-clock time as if it were UTC, or null when it isn't a real date and time. */
function wallMs(local: string): number | null {
  const m = LOCAL_RE.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi, m[6] ? Number(m[6]) : 0);
  const back = new Date(ms);
  // Date.UTC rolls 2026-02-30 over to March 2; refuse it rather than log the wrong day.
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h) return null;
  return ms;
}

/**
 * `2026-10-08T14:00` in the user's zone → `2026-10-08T21:00:00.000Z` (at UTC-7).
 * Null when the input isn't a valid local wall-clock time.
 */
export function localToInstant(local: string, zone: UserZone): string | null {
  const wall = wallMs(local);
  if (wall === null) return null;
  let ms = wall + zone.offsetMinutes * 60_000;
  if (isValidTimeZone(zone.timeZone)) {
    // Two passes settle it: the first guess may sit across a DST change from
    // the answer, the second measures the offset at the answer itself.
    for (let i = 0; i < 2; i++) ms = wall + offsetAt(zone.timeZone, ms) * 60_000;
  }
  return new Date(ms).toISOString();
}

/** Midnight at the start of a local `YYYY-MM-DD`, as a UTC instant. */
export function localDayStart(date: string, zone: UserZone): string | null {
  return LOCAL_DATE_RE.test(date) ? localToInstant(`${date}T00:00`, zone) : null;
}

/** The local day after `date` (`YYYY-MM-DD`), calendar arithmetic only. */
export function nextLocalDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
