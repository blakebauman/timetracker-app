import { useRef } from "react";
import { CalendarDays, List, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimerView } from "@/stores/uiStore";
import { TIMER_PANEL_ID, timerTabId } from "./timerTabs";
import {
  SEGMENT,
  SEGMENT_ACTIVE,
  SEGMENT_INACTIVE,
  SEGMENT_TRACK,
} from "@/components/ui/segmented-control";

const VIEWS: { value: TimerView; label: string; icon: typeof List }[] = [
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "list", label: "List", icon: List },
  { value: "timesheet", label: "Timesheet", icon: Table2 },
];

interface TimerViewSwitcherProps {
  view: TimerView;
  onChange: (view: TimerView) => void;
}

// Icon-only segment track that swaps between the views the Timer tab hosts.
// Full tab pattern: a single tab stop with roving tabindex plus arrow/Home/End.
export function TimerViewSwitcher({ view, onChange }: TimerViewSwitcherProps) {
  const ref = useRef<HTMLDivElement>(null);
  const views = VIEWS;

  const focusTab = (index: number) => {
    const next = views[(index + views.length) % views.length];
    onChange(next.value);
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
      className={SEGMENT_TRACK}
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
            tabIndex={active ? 0 : -1}
            aria-label={label}
            title={label}
            onClick={() => onChange(value)}
            className={cn(
              SEGMENT,
              "w-8 justify-center px-0",
              active ? SEGMENT_ACTIVE : SEGMENT_INACTIVE
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
