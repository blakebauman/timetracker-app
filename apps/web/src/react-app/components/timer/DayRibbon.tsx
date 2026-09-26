import { useTodayTrace, type TodayTrace } from "@/hooks/useTodayTrace";
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
 * Two sizes. `full` lives in the docked running bar: hour ticks, every third
 * one labelled. `compact` lives in the idle composer beside today's total: the
 * trace alone, because there the words say the numbers and the strip only has
 * to say "this is your day, and here is the hole in it".
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

export function DayRibbon({
  className,
  variant = "full",
  trace: provided,
}: {
  className?: string;
  variant?: "full" | "compact";
  /** Pass the trace when the caller already computed it (the composer does). */
  trace?: TodayTrace;
}) {
  const own = useTodayTrace();
  const { now, windowStart, windowEnd, segments, total, status } = provided ?? own;

  const span = windowEnd - windowStart;
  const pct = (t: number) => `${((t - windowStart) / span) * 100}%`;
  const hours = Math.round(span / HOUR);
  const ticks = Array.from({ length: hours + 1 }, (_, i) => windowStart + i * HOUR);
  const compact = variant === "compact";

  const trace = (
    <div
      className={cn(
        "absolute inset-x-0 h-2 rounded-full bg-muted",
        compact ? "top-1/2 -translate-y-1/2" : "top-1"
      )}
    >
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
      {/* Now. Red only where a timer runs: in the idle composer a red line
          beside the lit Start disc was a second light on a resting surface. */}
      <span
        aria-hidden
        className={cn("absolute -inset-y-1 w-px", compact ? "bg-foreground/40" : "bg-primary")}
        style={{ left: pct(now) }}
      />
    </div>
  );

  if (compact) {
    // Decorative here: the composer's own text carries the numbers.
    return (
      <div aria-hidden className={cn("relative h-4 min-w-0", className)}>
        {trace}
      </div>
    );
  }

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
