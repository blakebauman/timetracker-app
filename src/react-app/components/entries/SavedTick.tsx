import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Transient acknowledgement that an inline edit was saved.
 *
 * Occupies no layout space (absolutely positioned, `sr-only` live region for the
 * announcement) so a row doesn't reflow every time a duration is corrected —
 * reflow during rapid reconstruction would be worse than the silence this fixes.
 */
export function SavedTick({ saved, className }: { saved: boolean; className?: string }) {
  return (
    <>
      <Check
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-success transition-opacity duration-200",
          saved ? "opacity-100" : "opacity-0",
          className
        )}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {saved ? "Saved" : ""}
      </span>
    </>
  );
}
