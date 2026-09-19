import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";

interface ProjectBadgeProps {
  name: string;
  color?: string | null;
  className?: string;
}

/**
 * A project name pill tinted with the project's color.
 *
 * The width cap is not cosmetic. Unconstrained, a real consultancy project name
 * ("Experience Production Agent | IS | Phase 2") wrapped to three lines inside
 * the mobile entry row, so the metadata rendered as a tinted block four times
 * the visual weight of the one-line description it belongs to, and rows in the
 * same list came out at different heights depending on how their chip happened
 * to break. A chip is a label; it truncates and keeps its row.
 *
 * `title` carries the full name for the pointer, and the text stays selectable
 * and readable by assistive tech either way.
 */
export function ProjectBadge({ name, color, className }: ProjectBadgeProps) {
  const c = color ?? DEFAULT_PROJECT_COLOR;
  return (
    <span
      title={name}
      className={cn(
        "tt-swatch-tint inline-block max-w-48 truncate rounded-sm px-1.5 py-0.5 align-bottom text-xs font-medium",
        className
      )}
      style={{ "--swatch": c } as CSSProperties}
    >
      {name}
    </span>
  );
}
