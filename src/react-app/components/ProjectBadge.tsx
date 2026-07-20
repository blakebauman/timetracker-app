import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";

interface ProjectBadgeProps {
  name: string;
  color?: string | null;
  className?: string;
}

/** A project name pill tinted with the project's color. */
export function ProjectBadge({ name, color, className }: ProjectBadgeProps) {
  const c = color ?? DEFAULT_PROJECT_COLOR;
  return (
    <span
      className={cn(
        "tt-swatch-tint rounded-sm px-1.5 py-0.5 text-xs font-medium",
        className
      )}
      style={{ "--swatch": c } as CSSProperties}
    >
      {name}
    </span>
  );
}
