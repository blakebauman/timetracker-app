import { CalendarDays, Columns2, List, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimerView } from "@/stores/uiStore";

const VIEWS: { value: TimerView; label: string; icon: typeof List }[] = [
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "split", label: "Split", icon: Columns2 },
  { value: "list", label: "List", icon: List },
  { value: "timesheet", label: "Timesheet", icon: Table2 },
];

interface TimerViewSwitcherProps {
  view: TimerView;
  onChange: (view: TimerView) => void;
}

// Icon-only segmented control that swaps between the four views the Timer tab
// hosts. Purely in-page state — no routing.
export function TimerViewSwitcher({ view, onChange }: TimerViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Timer view"
      className="inline-flex items-center rounded-md border bg-muted/40 p-0.5"
    >
      {VIEWS.map(({ value, label, icon: Icon }) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(value)}
            className={cn(
              "flex h-7 w-8 items-center justify-center rounded transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
