import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
} from "date-fns";

/**
 * The shared period vocabulary for every collection page — Clients and
 * Projects both speak it, deliberately with the same four words.
 *
 * A deliberately short list, not the nine-preset Reports picker: a collection
 * page is for "how is this relationship doing", and a month is the cadence most
 * consultants invoice on; anything finer belongs in Reports, which is one click
 * away and built for slicing.
 *
 * The pages keep different *defaults* — Clients opens on this month, Projects
 * on all time, because a budget is cumulative — but they no longer keep
 * different vocabularies, and neither leaves its window unstated. One project
 * used to read 15h on Projects and 4h 30m on Clients with nothing on either
 * page saying they were different questions.
 */
export const COLLECTION_PERIODS = [
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisYear", label: "This year" },
  { value: "all", label: "All time" },
] as const;

export type CollectionPeriod = (typeof COLLECTION_PERIODS)[number]["value"];

/** Far enough back to predate any tracked entry, for the "All time" window. */
const ALL_TIME_FLOOR = new Date(2000, 0, 1);

export function resolveCollectionPeriod(
  period: CollectionPeriod,
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
