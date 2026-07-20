import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TimerViewSwitcher } from "./TimerViewSwitcher";
import { CalendarViewOptions } from "./CalendarViewOptions";
import { ListRangePicker } from "./ListRangePicker";
import type { TimerView } from "@/stores/uiStore";
import type { CalendarViewType } from "@/components/calendar/CalendarView";
import {
  formatPeriodLabel,
  formatDurationShort,
  formatListRangeLabel,
  summarizePeriod,
  type ListRangeKey,
} from "@/lib/dateUtils";

export interface LoggedSegment {
  projectId: string | null;
  projectName: string | null;
  color: string;
  seconds: number;
}

interface TimerWorkspaceHeaderProps {
  since: Date;
  until: Date;
  totalSeconds: number;
  segments: LoggedSegment[];
  view: TimerView;
  onViewChange: (view: TimerView) => void;
  /** Split needs two columns; below lg the tab is withdrawn entirely. */
  allowSplit: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** What one press of prev/next moves by, for the label and the a11y name. */
  periodNoun: "day" | "week" | "month";
  /** Week start (0=Sun..6=Sat), for naming week-shaped periods. */
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onToday: () => void;
  onAddEntry: () => void;
  onAiQuickAdd: () => void;
  // Calendar sub-controls — only rendered for calendar/split views.
  calendarView: CalendarViewType;
  /** What the user picked; the pane may be rendering something narrower. */
  requestedCalendarView: CalendarViewType;
  onCalendarViewChange: (v: CalendarViewType) => void;
  slotHeight: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showWeekends: boolean;
  onToggleWeekends: () => void;
  showGaps: boolean;
  onToggleGaps: () => void;
  // List-view date scope — replaces the week nav when the list view is active.
  listRangeKey: ListRangeKey;
  listRangeSince: string | null;
  listRangeUntil: string | null;
  onListRangeChange: (key: ListRangeKey, since?: string | null, until?: string | null) => void;
}

// Shared header for the unified Timer tab: period navigation, the "logged this
// period" bar, the 4-view switcher, and (for calendar/split) the day-count +
// zoom controls.
export function TimerWorkspaceHeader({
  since,
  until,
  totalSeconds,
  segments,
  view,
  onViewChange,
  allowSplit,
  onPrev,
  onNext,
  periodNoun,
  weekStartsOn: wso,
  onToday,
  onAddEntry,
  onAiQuickAdd,
  calendarView,
  requestedCalendarView,
  onCalendarViewChange,
  slotHeight,
  onZoomIn,
  onZoomOut,
  showWeekends,
  onToggleWeekends,
  showGaps,
  onToggleGaps,
  listRangeKey,
  listRangeSince,
  listRangeUntil,
  onListRangeChange,
}: TimerWorkspaceHeaderProps) {
  const showCalendarControls = view === "calendar" || view === "split";
  // A single-day grid has no week number to stamp on its label.
  const isDayView = calendarView === "timeGridDay";
  // The list view scopes by an explicit range instead of stepping week-by-week,
  // so it swaps the prev/next/Today nav for the range picker.
  const isListView = view === "list";

  // Short, spoken-language name for the active period, e.g. "this week",
  // "last week", "Jul 14 – 20", "Jun 2025". Deliberately lowercase: it reads as
  // the tail of the sentence "Logged this week".
  const periodSummary = summarizePeriod(since, until, wso);
  const now = new Date();
  const periodIncludesToday = now >= since && now <= until;

  return (
    <div className="border-b">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex items-center gap-2">
          {isListView ? (
            <ListRangePicker
              value={listRangeKey}
              customSince={listRangeSince}
              customUntil={listRangeUntil}
              onChange={onListRangeChange}
            />
          ) : (
            <>
              <div className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onPrev}
                      aria-label={`Previous ${periodNoun}`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous {periodNoun}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onNext}
                      aria-label={`Next ${periodNoun}`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next {periodNoun}</TooltipContent>
                </Tooltip>
              </div>
              {/* Redundant once the visible period already contains now — and
                  in the forced day view it rendered as the literal "Today Today"
                  beside the period label. Disabled rather than hidden so the
                  toolbar doesn't reflow as you step through weeks. */}
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={onToday}
                disabled={periodIncludesToday}
              >
                Today
              </Button>
            </>
          )}
          <h1 className="ml-1 text-sm font-semibold tracking-tight tabular-nums">
            {isListView
              ? formatListRangeLabel(listRangeKey, since, until, wso)
              : formatPeriodLabel(since, until, { weekStamp: !isDayView })}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showCalendarControls && (
            <CalendarViewOptions
              calendarView={calendarView}
              requestedCalendarView={requestedCalendarView}
              onCalendarViewChange={onCalendarViewChange}
              slotHeight={slotHeight}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              showWeekends={showWeekends}
              onToggleWeekends={onToggleWeekends}
              showGaps={showGaps}
              onToggleGaps={onToggleGaps}
            />
          )}

          <TimerViewSwitcher view={view} onChange={onViewChange} allowSplit={allowSplit} />

          {/* Split control: Add entry stays a single click (it's the primary
              action here); AI quick-add moves behind the caret rather than
              sitting at equal weight beside it. */}
          <div className="flex items-center rounded-md border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-r-none"
                  onClick={onAddEntry}
                  aria-label="Add entry"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add entry</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* Same icon-sm token as its sibling: a shorter caret left gaps
                    inside the shared border and needed an arbitrary divider. The
                    separator is the button's own left border. */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="w-6 rounded-l-none border-l"
                  aria-label="More ways to add"
                >
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onAiQuickAdd}>
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Add with AI…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Logged-this-period bar */}
      <div className="flex items-center gap-3 px-4 pb-2">
        {/* Name the period the number covers. "Logged" alone meant a different
            span in each view, so the total appeared to contradict itself when
            you switched tabs. */}
        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
          Logged <span className="text-foreground">{periodSummary}</span>
        </span>
        {/* At 0m the bar was a full-width empty grey track — a chart of nothing.
            Collapse to a hairline rule so the row keeps its rhythm without
            implying there's a value to read. */}
        <div
          className={cn(
            "flex flex-1 overflow-hidden rounded-full bg-muted transition-all",
            totalSeconds > 0 ? "h-2" : "h-px"
          )}
        >
          {totalSeconds > 0 &&
            segments.map((seg) => (
              <Tooltip key={seg.projectId ?? "none"}>
                <TooltipTrigger asChild>
                  <div
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${(seg.seconds / totalSeconds) * 100}%`,
                      backgroundColor: seg.color,
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {seg.projectName ?? "No project"}
                  <span className="ml-1.5 text-background/60">
                    {formatDurationShort(seg.seconds)} ·{" "}
                    {Math.round((seg.seconds / totalSeconds) * 100)}%
                  </span>
                </TooltipContent>
              </Tooltip>
            ))}
        </div>
        <span className="text-xs font-semibold tabular-nums">
          {formatDurationShort(totalSeconds)}
        </span>
        <Link
          to="/reports"
          className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View reports
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
