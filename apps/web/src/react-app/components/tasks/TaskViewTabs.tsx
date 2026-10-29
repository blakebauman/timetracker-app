import { useRef } from "react";
import { cn } from "@/lib/utils";
import {
  SEGMENT,
  SEGMENT_ACTIVE,
  SEGMENT_INACTIVE,
  SEGMENT_TRACK,
} from "@/components/ui/segmented-control";

/**
 * Today and the week ahead are the Timer's plan column, beside the time they
 * plan; this page is the whole backlog, the board and the record.
 */
export type TaskView = "all" | "board" | "history";

const VIEWS: { value: TaskView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "board", label: "Board" },
  { value: "history", label: "History" },
];

interface TaskViewTabsProps {
  view: TaskView;
  /** Open top-level tasks. The only tab with a count: it's the size of the list. */
  allCount: number;
  onChange: (view: TaskView) => void;
}

/**
 * The Tasks page's primary navigation: a `tablist` (roving tabindex, arrow
 * keys) drawn as the shared segment track.
 */
export function TaskViewTabs({ view, allCount, onChange }: TaskViewTabsProps) {
  const ref = useRef<HTMLDivElement>(null);

  const focusTab = (index: number) => {
    const tabs = ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const next = tabs?.[(index + VIEWS.length) % VIEWS.length];
    next?.focus();
    if (next?.dataset.value) onChange(next.dataset.value as TaskView);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const current = VIEWS.findIndex((v) => v.value === view);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusTab(current + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusTab(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTab(VIEWS.length - 1);
    }
  };

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Task view"
      onKeyDown={onKeyDown}
      className={SEGMENT_TRACK}
    >
      {VIEWS.map(({ value, label }) => {
        const active = value === view;
        const count = value === "all" ? allCount : 0;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            data-value={value}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            aria-label={count > 0 ? `${label}, ${count} task${count === 1 ? "" : "s"}` : label}
            onClick={() => onChange(value)}
            className={cn(SEGMENT, "gap-1.5", active ? SEGMENT_ACTIVE : SEGMENT_INACTIVE)}
          >
            {label}
            {count > 0 && (
              <span
                aria-hidden
                className={cn(
                  "tabular-nums",
                  // Muted ink is tuned for the track and vanishes on the
                  // recessed pill, so the active count reads in full ink.
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
