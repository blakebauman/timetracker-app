import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
} from "date-fns";

/**
 * The Clients page scopes by a deliberately short list, not the nine-preset
 * Reports picker. A collection page is for "how is this relationship doing",
 * and a month is the cadence most consultants invoice on; anything finer
 * belongs in Reports, which is one click away and built for slicing.
 */
export const CLIENT_PERIODS = [
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisYear", label: "This year" },
  { value: "all", label: "All time" },
] as const;

export type ClientPeriod = (typeof CLIENT_PERIODS)[number]["value"];

/** Far enough back to predate any tracked entry, for the "All time" window. */
const ALL_TIME_FLOOR = new Date(2000, 0, 1);

export function resolveClientPeriod(
  period: ClientPeriod,
  now = new Date()
): { since: string; until: string } {
  switch (period) {
    case "lastMonth": {
      const m = subMonths(now, 1);
      return { since: startOfMonth(m).toISOString(), until: endOfMonth(m).toISOString() };
    }
    case "thisYear":
      return { since: startOfYear(now).toISOString(), until: endOfYear(now).toISOString() };
    case "all":
      return { since: ALL_TIME_FLOOR.toISOString(), until: endOfYear(now).toISOString() };
    case "thisMonth":
    default:
      return { since: startOfMonth(now).toISOString(), until: endOfMonth(now).toISOString() };
  }
}
