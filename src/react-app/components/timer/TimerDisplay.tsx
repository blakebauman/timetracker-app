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
