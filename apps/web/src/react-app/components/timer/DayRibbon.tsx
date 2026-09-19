import { useMemo } from "react";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { useEntriesRange } from "@/hooks/useEntries";
import { useTimerStore } from "@/stores/timerStore";
import { useDayRollover } from "@/hooks/useDayRollover";
import { formatDurationShort } from "@/lib/dateUtils";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import { cn } from "@/lib/utils";

/**
 * Today as a trace.
 *
 * The docked running bar's trace: the
 * tracked day drawn as a strip, every entry a segment in its project colour,
 * the running one in brand red and growing with the tick. It answers "what
 * does today look like so far" without a route change, and it makes a
 * timer that has been running for four hours look like a timer that has been
 * running for four hours — the readout beside it says the number, this says
 * the shape.
 *
 * The window is the working day: 07:00 to 19:00, stretched earlier or later
 * if an entry or the clock falls outside it, so an evening session never gets
 * clipped and a quiet morning never squashes the strip. One tick per hour,
 * every third one labelled.
 */
const HOUR = 3_600_000;

export function DayRibbon({ className }: { className?: string }) {
  const dayKey = useDayRollover();
  // parseISO, not `new Date(dayKey)`: a bare "yyyy-MM-dd" parses as UTC
  // midnight, which in any timezone west of Greenwich is *yesterday* local —
  // the ribbon then spanned two days and queried the wrong one.
  const today = useMemo(() => parseISO(dayKey), [dayKey]);
  const since = useMemo(() => startOfDay(today), [today]);
  const until = useMemo(() => endOfDay(today), [today]);
  const { data: entries = [] } = useEntriesRange(since.toISOString(), until.toISOString());
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const elapsed = useTimerStore((s) => s.elapsed);
  const localStartTime = useTimerStore((s) => s.localStartTime);
  const dayStart = since.getTime();

  // "Now" is derived from the timer's own clock rather than read during
  // render: the store anchors the running entry at `localStartTime` and ticks
  // `elapsed` once a second, so their sum is the current instant to the
  // second — and it is exactly the tick that moves the live segment's right
  // edge. The ribbon only renders in the docked (running) bar, so the anchor
  // is always set; the fallback keeps the maths finite if it ever isn't.
  const now = localStartTime !== null ? localStartTime + elapsed * 1000 : dayStart + 12 * HOUR;

  const { windowStart, windowEnd, segments, total } = useMemo(() => {
    let start = dayStart + 7 * HOUR;
    let end = dayStart + 19 * HOUR;
    let total = 0;
    const segs: { key: string; from: number; to: number; color: string; running: boolean }[] =
      [];
    for (const e of entries) {
      const from = new Date(e.start).getTime();
      const to = e.stop ? new Date(e.stop).getTime() : now;
      if (to <= from) continue;
      start = Math.min(start, from);
      end = Math.max(end, to);
      total += e.duration ?? Math.round((to - from) / 1000);
      segs.push({
        key: e.id,
        from,
        to,
        color: e.projectColor ?? DEFAULT_PROJECT_COLOR,
        running: !e.stop,
      });
    }
    // The running entry may not be in the day query yet (it was started this
    // tick, or it started yesterday); draw it from the store either way.
    if (runningEntry && !segs.some((s) => s.key === runningEntry.id)) {
      const from = Math.max(new Date(runningEntry.start).getTime(), dayStart);
      start = Math.min(start, from);
      end = Math.max(end, now);
      segs.push({
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
    return { windowStart: start, windowEnd: end, segments: segs, total };
  }, [entries, runningEntry, dayStart, now]);

  const span = windowEnd - windowStart;
  const pct = (t: number) => `${((t - windowStart) / span) * 100}%`;
  const hours = Math.round(span / HOUR);
  const ticks = Array.from({ length: hours + 1 }, (_, i) => windowStart + i * HOUR);

  const liveTotal = total + (runningEntry && !entries.some((e) => e.id === runningEntry.id) ? elapsed : 0);

  return (
    <div
      role="img"
      aria-label={
        liveTotal > 0
          ? `Today: ${formatDurationShort(liveTotal)} tracked across ${segments.length} ${segments.length === 1 ? "entry" : "entries"}`
          : "Nothing tracked today yet"
      }
      className={cn("relative h-9 min-w-0", className)}
    >
      {/* Hour ticks, every third one labelled. */}
      {ticks.map((t, i) => {
        const labelled = i % 3 === 0;
        const label = new Date(t).getHours();
        return (
          <span
            key={t}
            aria-hidden
            className="absolute top-0 flex flex-col items-center"
            style={{ left: pct(t), transform: "translateX(-50%)" }}
          >
            <span className={cn("w-px bg-border-strong", labelled ? "h-2" : "h-1")} />
            {labelled && i < ticks.length - 1 && (
              <span className="mt-0.5 font-mono text-micro tabular-nums text-muted-foreground">
                {label}
              </span>
            )}
          </span>
        );
      })}
      {/* The trace. */}
      <div className="absolute inset-x-0 top-6 h-2 rounded-full bg-muted">
        {segments.map((s) => (
          <span
            key={s.key}
            aria-hidden
            className={cn(
              "absolute inset-y-0 rounded-full",
              s.running && "bg-primary animate-running-dot"
            )}
            style={{
              left: pct(s.from),
              width: `max(2px, calc(${pct(s.to)} - ${pct(s.from)}))`,
              backgroundColor: s.running ? undefined : s.color,
            }}
          />
        ))}
        {/* Now. */}
        <span
          aria-hidden
          className="absolute -inset-y-1 w-px bg-primary"
          style={{ left: pct(now) }}
        />
      </div>
    </div>
  );
}
