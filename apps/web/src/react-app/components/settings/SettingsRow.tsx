import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsRowProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** Leading glyph, 16px in muted ink. */
  icon?: LucideIcon;
  /** The row's name. A string truncates; pass a node to add a badge beside it. */
  label: ReactNode;
  /** One line beneath the name — a date, a schedule, an address. Wraps, never truncates. */
  description?: ReactNode;
  /** The right-hand cluster: a Switch, a Button, icon buttons. */
  trailing?: ReactNode;
}

/**
 * A list row inside a Settings card: the DESIGN.md row card at list density
 * (12px corners, hairline, 16px sides, 10px vertical).
 *
 * The same string lived in five cards and three near-copies, all on `rounded-md`,
 * so every settings list was the one place in the app where a container had
 * 6px corners. One component, one shape.
 */
export function SettingsRow({
  icon: Icon,
  label,
  description,
  trailing,
  className,
  ...props
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-container border px-4 py-2.5 text-sm",
        className
      )}
      {...props}
    >
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 font-medium">
          {typeof label === "string" ? <span className="truncate">{label}</span> : label}
        </div>
        {description && (
          <p className="mt-0.5 text-xs leading-normal text-muted-foreground">{description}</p>
        )}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-1">{trailing}</div>}
    </div>
  );
}
