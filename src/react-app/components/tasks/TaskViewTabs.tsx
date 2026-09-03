import { useRef } from "react";
import { cn } from "@/lib/utils";

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
 * The Tasks page's primary navigation.
 *
 * Three things it does that a bare segmented control didn't:
 *
 * 1. **It carries counts.** A view switcher with no numbers makes you open each
 *    tab to find out whether it was worth opening. "Today 3" is the whole reason
 *    to look, and on a planning surface it's the most valuable pixel on the page.
 * 2. **Overdue tints the Today count**, not the label — so lateness is legible
 *    from the tab strip without a second badge, and the strip stays one shape.
 *    Only the count changes colour, which keeps the accent on a number that
 *    means something rather than on a tab that is always there.
 * 3. **It's a `tablist`**, matching the Timer's view switcher: same roving
 *    tabindex, same arrow-key behaviour, same semantics for a control that
 *    swaps a panel. The shared `SegmentedControl` is a `radiogroup` — right for
 *    a setting like 12h/24h, wrong for navigation — so this doesn't reuse it,
 *    but it does reuse its visual treatment (DESIGN.md §5).
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
      className="inline-flex h-8 items-center rounded-full bg-muted p-[3px]"
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
            // Roving tabindex: only the selected tab is in the tab order.
            tabIndex={active ? 0 : -1}
            aria-label={
              count > 0
                ? `${label}, ${count} task${count === 1 ? "" : "s"}${
                    late ? `, ${counts.overdue} overdue` : ""
                  }`
                : label
            }
            onClick={() => onChange(value)}
            className={cn(
              "flex h-full items-center gap-1.5 rounded-full px-3 text-xs font-medium",
              "transition-colors duration-fast ease-out-quart",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {count > 0 && (
              <span
                aria-hidden
                className={cn(
                  "tabular-nums",
                  late
                    ? "text-destructive"
                    : active
                      ? "text-background/70"
                      : "text-muted-foreground/60"
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
