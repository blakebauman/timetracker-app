import { cn } from "@/lib/utils";
import { formatSeconds } from "@/lib/dateUtils";

interface TimerDisplayProps {
  seconds: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function TimerDisplay({
  seconds,
  className,
  size = "md",
}: TimerDisplayProps) {
  return (
    <span
      // `role="timer"` is exactly this: "a numerical counter which indicates an
      // amount of elapsed time". Its implicit `aria-live` is `off`, which is the
      // point — a live region on a value that changes every second would make
      // the app unusable with a screen reader. What assistive tech needs is for
      // the number to be *identifiable* on demand, which the role provides and
      // the caller's accessible name supplies.
      role="timer"
      className={cn(
        "font-mono tabular-nums",
        size === "sm" && "text-sm",
        size === "md" && "text-lg font-semibold",
        size === "lg" && "text-4xl font-bold",
        className
      )}
    >
      {formatSeconds(seconds)}
    </span>
  );
}
