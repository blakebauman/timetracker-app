import { useRef } from "react";
import { cn } from "@/lib/utils";
import {
  SEGMENT,
  SEGMENT_ACTIVE,
  SEGMENT_INACTIVE,
  SEGMENT_TRACK,
} from "@/components/ui/segmented-control";

export type TaskView = "today" | "upcoming" | "all";

export interface TaskViewCounts {
  today: number;
  /** Part of `today` that is already late — tints the count, never the label. */
  overdue: number;
  upcoming: number;
  all: number;
}

const VIEWS: { value: TaskView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "all", label: "All" },
];

interface TaskViewTabsProps {
  view: TaskView;
  counts: TaskViewCounts;
  onChange: (view: TaskView) => void;
}

/**
 * The Tasks page's primary navigation: a `tablist` (roving tabindex, arrow
 * keys) drawn as the shared segment track, carrying counts. Overdue tints the
 * Today count, not the label, so lateness is legible from the strip without a
 * second badge.
 */
export function TaskViewTabs({ view, counts, onChange }: TaskViewTabsProps) {
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
        const count = counts[value];
        const late = value === "today" && counts.overdue > 0;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            data-value={value}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            aria-label={
              count > 0
                ? `${label}, ${count} task${count === 1 ? "" : "s"}${
                    late ? `, ${counts.overdue} overdue` : ""
                  }`
                : label
            }
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
                  late ? "text-destructive" : active ? "text-foreground" : "text-muted-foreground"
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
