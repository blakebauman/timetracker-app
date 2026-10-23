import { CalendarCheck, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWeekReview } from "@/hooks/useWeekReview";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

/**
 * The Timer header's way into closing the week shown. Its label is the week's
 * state: "Close week" while open, "Closed" once closed, and "Changed" when an
 * edit since then needs re-submitting — the one state worth catching the eye.
 * Lives in its own module so the header doesn't pull the dialog into its chunk.
 */
export function CloseWeekButton({ weekStart, className }: { weekStart: string; className?: string }) {
  const openWeekReview = useUIStore((s) => s.openWeekReview);
  const { data } = useWeekReview(weekStart);
  const closure = data?.weekStart === weekStart ? data.closure : null;
  const changed = (closure?.changes.length ?? 0) > 0;
  const label = changed ? "Changed" : closure ? "Closed" : "Close week";
  const Icon = closure && !changed ? CalendarCheck : CalendarClock;

  return (
    <Button
      variant={changed ? "secondary" : "outline"}
      size="sm"
      className={cn("h-8 gap-1.5", className)}
      onClick={() => openWeekReview(weekStart)}
      aria-label={
        changed ? "Week changed since closed — review" : closure ? "Week closed — review" : "Review and close week"
      }
      title="Check the week's hours, copy them, and mark them submitted"
    >
      <Icon className={cn("h-3.5 w-3.5", changed && "text-warning-ink")} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
