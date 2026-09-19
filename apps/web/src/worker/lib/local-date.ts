/**
 * The `YYYY-MM-DD` calendar day a UTC instant falls on in `timeZone`.
 *
 * The database stores instants; external systems (Workfront's `entryDate`,
 * Dynamics' `msdyn_date`) file work against a calendar day. Slicing the ISO
 * string takes the *UTC* day, which west of UTC rolls over during the working
 * evening — an 18:00 entry at UTC-6 was pushed under tomorrow's date, quietly
 * landing billable hours on the wrong day.
 *
 * Resolved per instant rather than from a single offset, so a backlog pushed
 * across a DST boundary still dates each entry by the rule in force when it was
 * tracked. An absent or unrecognised zone falls back to the UTC day: worse, but
 * it is what the caller would have got anyway, and a push must not fail over a
 * malformed preference.
 */
export function localDateInZone(iso: string, timeZone?: string | null): string {
  if (!timeZone) return iso.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const get = (type: "year" | "month" | "day") =>
      parts.find((p) => p.type === type)?.value;
    const [year, month, day] = [get("year"), get("month"), get("day")];
    if (!year || !month || !day) return iso.slice(0, 10);
    return `${year}-${month}-${day}`;
  } catch {
    // RangeError for an unknown zone id.
    return iso.slice(0, 10);
  }
}
