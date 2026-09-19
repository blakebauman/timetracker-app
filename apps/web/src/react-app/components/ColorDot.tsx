import { cn } from "@/lib/utils";

/** Fallback swatch color for entities without an assigned color. */
// A project with no colour is grey, and in this system grey is chroma zero —
// the old value was a blue-tinted slate, the one tinted neutral on the page.
export const DEFAULT_PROJECT_COLOR = "#9a9a9a";

interface ColorDotProps {
  color?: string | null;
  className?: string;
}

/** A small round color swatch used for projects, tags, and legends. */
export function ColorDot({ color, className }: ColorDotProps) {
  return (
    <span
      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color ?? DEFAULT_PROJECT_COLOR }}
    />
  );
}
