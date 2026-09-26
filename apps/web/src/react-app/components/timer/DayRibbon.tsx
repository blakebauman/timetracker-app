import { useTodayTrace } from "@/hooks/useTodayTrace";
import { formatDurationShort } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Today as a trace.
 *
 * The tracked day drawn as a strip, every entry a segment in its project
 * colour, the running one in brand red and growing with the tick. It answers
 * "what does today look like so far" without a route change, and it makes a
 * timer that has been running for four hours look like a timer that has been
 * running for four hours — the readout beside it says the number, this says
 * the shape.
 *
 * It sits in the same place in both bodies of the docked bar — idle and
 * running — with hour ticks, every third clock hour labelled. Idle, it shows
 * the day's shape and the hole since the last stop; the now-line is neutral
 * there, since the only lit control on an idle bar is the Start disc.
 *
 * The live segment is not just a colour. The first auto-assigned project
 * colour used to be red, so a finished segment could match it exactly — the
 * one place that answers "am I still tracking?" was ambiguous. The live
 * segment stands proud of the track (taller than the finished ones) and
 * breathes, so it reads as "now" in any palette and in greyscale.
 *
 * The window is the working day: 07:00 to 19:00, stretched earlier or later
 * if an entry or the clock falls outside it, so an evening session never gets
 * clipped and a quiet morning never squashes the strip.
 */
const HOUR = 3_600_000;

export function DayRibbon({ className }: { className?: string }) {
  const { now, windowStart, windowEnd, segments, total, status } = useTodayTrace();

  const span = windowEnd - windowStart;
  const pct = (t: number) => `${((t - windowStart) / span) * 100}%`;
  const hours = Math.round(span / HOUR);
  const ticks = Array.from({ length: hours + 1 }, (_, i) => windowStart + i * HOUR);
  const live = segments.some((s) => s.running);

  const trace = (
    <div className="absolute inset-x-0 top-1 h-2 rounded-full bg-muted">
      {segments.map((s) => (
        <span
          key={s.key}
          aria-hidden
          className={cn(
            "absolute rounded-full",
            // The live segment stands 2px proud of the track on each side.
            s.running ? "-inset-y-0.5 bg-primary animate-running-dot" : "inset-y-0"
          )}
          style={{
            left: pct(s.from),
            width: `max(2px, calc(${pct(s.to)} - ${pct(s.from)}))`,
            backgroundColor: s.running ? undefined : s.color,
          }}
        />
      ))}
      {/* Now. Red only while a timer runs: on the idle bar a red line beside
          the lit Start disc was a second light on a resting surface. */}
      <span
        aria-hidden
        className={cn("absolute -inset-y-1 w-px", live ? "bg-primary" : "bg-foreground/40")}
        style={{ left: pct(now) }}
      />
    </div>
  );


  // Unknown is not empty: while today's entries load, hold the shape without
  // drawing — or announcing — a day with nothing in it.
  if (status === "pending") {
    return (
      <div role="img" aria-label="Loading today" className={cn("relative h-9 min-w-0", className)}>
        <Skeleton className="absolute inset-x-0 top-1 h-2 rounded-full" />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={
        total > 0
          ? `Today: ${formatDurationShort(total)} tracked across ${segments.length} ${segments.length === 1 ? "entry" : "entries"}`
          : "Nothing tracked today yet"
      }
      className={cn("relative h-9 min-w-0", className)}
    >
      {trace}
      {/* Hour ticks under the trace, every third one labelled. */}
      {ticks.map((t, i) => {
        // Every third hour of the *clock* (0, 3, 6, 9…), not every third
        // tick: a window stretched to an early entry used to label 2, 5, 8.
        const labelled = new Date(t).getHours() % 3 === 0;
        return (
          <span
            key={t}
            aria-hidden
            className="absolute top-3 flex flex-col items-center"
            style={{ left: pct(t), transform: "translateX(-50%)" }}
          >
            <span className={cn("w-px bg-border-strong", labelled ? "h-1.5" : "h-1")} />
            {labelled && i < ticks.length - 1 && (
              <span className="font-mono text-xs leading-4 tabular-nums text-muted-foreground">
                {new Date(t).getHours()}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
