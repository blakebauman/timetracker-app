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
        "rounded-sm px-1.5 py-0.5 text-xs font-medium",
        className
      )}
      style={{ backgroundColor: `${c}22`, color: c }}
    >
      {name}
    </span>
  );
}
