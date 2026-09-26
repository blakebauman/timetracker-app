import { useEffect, useMemo, useState } from "react";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { useEntriesRange } from "@/hooks/useEntries";
import { useTimerStore } from "@/stores/timerStore";
import { useDayRollover } from "@/hooks/useDayRollover";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";

/**
 * Today's entries as segments on a working-day window: the data behind the
 * day ribbon (components/timer/DayRibbon.tsx) and the idle composer's day
 * summary. The window is 07:00 to 19:00, stretched earlier or later if an
 * entry or the clock falls outside it, snapped to whole hours.
 */
const HOUR = 3_600_000;

interface TodaySegment {
  key: string;
  from: number;
  to: number;
  color: string;
  running: boolean;
}

export interface TodayTrace {
  now: number;
  windowStart: number;
  windowEnd: number;
  segments: TodaySegment[];
  /** Seconds tracked today, including the running timer. */
  total: number;
  /** When the last finished entry today stopped, if nothing is running. */
  lastStop: number | null;
  /**
   * Whether today's entries have actually loaded. Until they have, an empty
   * trace means "don't know", not "nothing tracked" — the composer used to
   * say the latter beside a list showing the day's hours.
   */
  status: "pending" | "error" | "ready";
}

/**
 * The instant, for the idle composer, where there is no timer tick to derive
 * it from. A minute is the resolution anything idle displays at.
 */
function useIdleNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    // Re-read on (re)enable: the state was seeded at mount, which can be hours
    // before the timer that just stopped. Deferred a tick so the effect body
    // doesn't set state synchronously.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [enabled]);
  return now;
}

/** Today's entries as segments on a working-day window, shared by both sizes. */
export function useTodayTrace(): TodayTrace {
  const dayKey = useDayRollover();
  // parseISO, not `new Date(dayKey)`: a bare "yyyy-MM-dd" parses as UTC
  // midnight, which in any timezone west of Greenwich is *yesterday* local —
  // the ribbon then spanned two days and queried the wrong one.
  const today = useMemo(() => parseISO(dayKey), [dayKey]);
  const since = useMemo(() => startOfDay(today), [today]);
  const until = useMemo(() => endOfDay(today), [today]);
  const {
    data: entries = [],
    isPending,
    isError,
  } = useEntriesRange(since.toISOString(), until.toISOString());
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const elapsed = useTimerStore((s) => s.elapsed);
  const localStartTime = useTimerStore((s) => s.localStartTime);
  const dayStart = since.getTime();
  const idleNow = useIdleNow(localStartTime === null);

  // Running, "now" is derived from the timer's own clock: the store anchors
  // the entry at `localStartTime` and ticks `elapsed` once a second, so their
  // sum is the current instant — and exactly the tick that moves the live
  // segment's right edge. Idle, a half-minute clock is enough.
  const now = localStartTime !== null ? localStartTime + elapsed * 1000 : idleNow;

  return useMemo(() => {
    let start = dayStart + 7 * HOUR;
    let end = dayStart + 19 * HOUR;
    let total = 0;
    let lastStop: number | null = null;
    const segments: TodaySegment[] = [];
    for (const e of entries) {
      const from = new Date(e.start).getTime();
      const running = !e.stop;
      const to = running ? now : new Date(e.stop!).getTime();
      if (to <= from) continue;
      start = Math.min(start, from);
      end = Math.max(end, to);
      total += e.duration ?? Math.round((to - from) / 1000);
      if (!running) lastStop = Math.max(lastStop ?? 0, to);
      segments.push({
        key: e.id,
        from,
        to,
        color: e.projectColor ?? DEFAULT_PROJECT_COLOR,
        running,
      });
    }
    // The running entry may not be in the day query yet (it was started this
    // tick, or it started yesterday); draw it from the store either way.
    if (runningEntry && !segments.some((s) => s.key === runningEntry.id)) {
      const from = Math.max(new Date(runningEntry.start).getTime(), dayStart);
      start = Math.min(start, from);
      end = Math.max(end, now);
      total += elapsed;
      segments.push({
        key: runningEntry.id,
        from,
        to: now,
        color: runningEntry.projectColor ?? DEFAULT_PROJECT_COLOR,
        running: true,
      });
    }
    end = Math.max(end, now);
    // Snap the window to whole hours so the ticks land on the hour.
    start = Math.floor((start - dayStart) / HOUR) * HOUR + dayStart;
    end = Math.ceil((end - dayStart) / HOUR) * HOUR + dayStart;
    return {
      now,
      windowStart: start,
      windowEnd: end,
      segments,
      total,
      lastStop: runningEntry ? null : lastStop,
      status: isPending ? "pending" : isError ? "error" : "ready",
    } satisfies TodayTrace;
  }, [entries, runningEntry, dayStart, now, elapsed, isPending, isError]);
}

