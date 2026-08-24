import { useRef } from "react";
import { CalendarDays, CalendarRange, Columns2, List, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimerView } from "@/stores/uiStore";
import { TIMER_PANEL_ID, timerTabId } from "./timerTabs";

const VIEWS: { value: TimerView; label: string; icon: typeof List }[] = [
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "split", label: "Split", icon: Columns2 },
  { value: "list", label: "List", icon: List },
  { value: "timesheet", label: "Timesheet", icon: Table2 },
  { value: "planner", label: "Planner", icon: CalendarRange },
];

interface TimerViewSwitcherProps {
  view: TimerView;
  onChange: (view: TimerView) => void;
  /** Split needs two columns. Below lg it's withdrawn rather than shown broken. */
  allowSplit?: boolean;
}

// Icon-only segmented control that swaps between the views the Timer tab
// hosts. Purely in-page state — no routing.
//
// Implements the full tab pattern, not just the roles: a single tab stop with
// roving tabindex plus arrow/Home/End keys. Four separate tab stops that ignore
// arrow keys announce as a tablist but don't behave like one, which is worse for
// a screen-reader user than plain buttons would have been.
export function TimerViewSwitcher({
  view,
  onChange,
  allowSplit = true,
}: TimerViewSwitcherProps) {
  const ref = useRef<HTMLDivElement>(null);
  const views = allowSplit ? VIEWS : VIEWS.filter((v) => v.value !== "split");

  const focusTab = (index: number) => {
    const next = views[(index + views.length) % views.length];
    onChange(next.value);
    // Selection follows focus, so move focus with it.
    ref.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(timerTabId(next.value))}`)
      ?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = views.findIndex((v) => v.value === view);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusTab(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusTab(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTab(views.length - 1);
    }
  };

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Timer view"
      onKeyDown={onKeyDown}
      className="inline-flex items-center rounded-md border bg-muted/40 p-0.5"
    >
      {views.map(({ value, label, icon: Icon }) => {
        const active = view === value;
        return (
          <button
            key={value}
            id={timerTabId(value)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={TIMER_PANEL_ID}
            // Roving tabindex: only the selected tab is in the tab order.
            tabIndex={active ? 0 : -1}
            aria-label={label}
            title={label}
            onClick={() => onChange(value)}
            className={cn(
              "flex h-7 w-8 items-center justify-center rounded transition-colors duration-fast ease-out-quart",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
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
