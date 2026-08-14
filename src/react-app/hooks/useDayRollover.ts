import { useEffect, useState } from "react";
import { format } from "date-fns";

/** Today, in the viewer's timezone. Changes identity only when the date does. */
const currentDayKey = () => format(new Date(), "yyyy-MM-dd");

/**
 * The current local date as a `yyyy-MM-dd` string, re-rendering the caller when
 * the calendar day rolls over.
 *
 * Presets like "Today" or "This week" resolve against `new Date()` at render
 * time, which silently assumes the page is short-lived. It isn't — this app is
 * left open all day, and often overnight. Without a signal that the day changed,
 * a memoized range stayed pinned to *yesterday*: the picker still said "Today",
 * the list still queried yesterday's window, and time tracked after midnight
 * appeared only as long as the optimistic cache patch held it there — the
 * refetch after Stop dropped it, and only a manual reload brought it back.
 *
 * Scheduling to the next local midnight is the primary trigger; the visibility
 * and focus listeners are the safety net for a laptop that was asleep when the
 * timer should have fired (a suspended machine fires it late, or coalesces it).
 */
export function useDayRollover(): string {
  const [dayKey, setDayKey] = useState(currentDayKey);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    // Keeps the identity stable when nothing changed, so listeners that fire
    // constantly (visibilitychange, focus) don't re-render the tree.
    const sync = () => setDayKey((prev) => {
      const next = currentDayKey();
      return prev === next ? prev : next;
    });

    const scheduleMidnight = () => {
      const next = new Date();
      // A second past midnight, so a slightly-early callback still reads the
      // new date rather than re-scheduling zero milliseconds ahead in a loop.
      next.setHours(24, 0, 1, 0);
      timeout = setTimeout(() => {
        sync();
        scheduleMidnight();
      }, next.getTime() - Date.now());
    };

    scheduleMidnight();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return dayKey;
}
