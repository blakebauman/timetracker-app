import { ChevronLeft, ChevronRight, Plus, Sparkles, ChevronDown, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaneActions, PaneHeader, PaneTitle } from "@/components/layout/Pane";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TimerViewSwitcher } from "./TimerViewSwitcher";
import { DraftDayButton } from "@/components/drafts/DraftDayButton";
import { CalendarViewOptions } from "./CalendarViewOptions";
import { VIEW_LABELS } from "./calendarViewLabels";
import { ListRangePicker } from "./ListRangePicker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { TimerView, TimesheetMode } from "@/stores/uiStore";
import type { CalendarViewType } from "@/components/calendar/CalendarView";
import {
  formatPeriodLabel,
  formatDurationShort,
  formatListRangeLabel,
  summarizePeriod,
  type ListRangeKey,
} from "@/lib/dateUtils";

interface TimerWorkspaceHeaderProps {
  since: Date;
  until: Date;
  /** Seconds logged in the period, or null when the range could not be loaded. */
  totalSeconds: number | null;
  view: TimerView;
  onViewChange: (view: TimerView) => void;
  /** Timesheet only: whether its cells hold tracked time or the plan. */
  timesheetMode: TimesheetMode;
  onTimesheetModeChange: (mode: TimesheetMode) => void;
  onPrev: () => void;
  onNext: () => void;
  /** What one press of prev/next moves by, for the label and the a11y name. */
  periodNoun: "day" | "week" | "month";
  /** Week start (0=Sun..6=Sat), for naming week-shaped periods. */
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onToday: () => void;
  onAddEntry: () => void;
  onAiQuickAdd: () => void;
  /** Draft the visible day's missing entries, then open review. */
  onDraftDay: () => void;
  draftPending: boolean;
  /** Drafts already waiting on the visible period — shows "Review N" in the header. */
  draftCount: number;
  /** The day drafting acts on, as the menu names it ("today", "Mon 16 Nov"). */
  draftDayLabel: string;
  // Calendar sub-controls — only rendered for the calendar view.
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
  /** Opens the plan where the column can't stand beside the view (see TimerWorkspace). */
  planControl?: React.ReactNode;
}

// Shared header for the unified Timer tab: the period and its total, period
// navigation, the 3-view switcher, and the per-view controls (calendar options,
// the timesheet's Logged/Plan mode).
export function TimerWorkspaceHeader({
  since,
  until,
  totalSeconds,
  view,
  onViewChange,
  timesheetMode,
  onTimesheetModeChange,
  onPrev,
  onNext,
  periodNoun,
  weekStartsOn: wso,
  onToday,
  onAddEntry,
  onAiQuickAdd,
  onDraftDay,
  draftPending,
  draftCount,
  draftDayLabel,
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
  planControl,
}: TimerWorkspaceHeaderProps) {
  const showCalendarControls = view === "calendar";
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
  // The pane can be too narrow for the view the user asked for (the plan column
  // narrows it, phones force a single day). CalendarViewOptions explains this, but
  // only once you open it — so the header total silently changes from a week to
  // a day with nothing on screen saying why. Say it where the number changed.
  const densityReduced = showCalendarControls && calendarView !== requestedCalendarView;

  return (
    // The Timer's header floats over its body like every other pane's: the
    // period is the page's name (24px bold), the stepper and Today sit beside
    // it with the period's total, and the view controls right-align.
    <PaneHeader>
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <PaneTitle className="tabular-nums">
          {isListView
            ? formatListRangeLabel(listRangeKey, since, until, wso)
            : formatPeriodLabel(since, until, { weekStamp: !isDayView })}
        </PaneTitle>
        {/* The period's total sits beside the period's name. It used to be a
            second header row with a project-coloured proportion bar, which
            repeated the dock's day ribbon, the list's day totals and the
            timesheet's Total column; the breakdown lives in Reports. A failed
            range fetch reads as a dash, never as 0m. */}
        <span
          className="font-mono text-sm font-semibold tabular-nums"
          aria-label={
            totalSeconds === null
              ? `Couldn't load what was logged ${periodSummary}`
              : `Logged ${periodSummary}: ${formatDurationShort(totalSeconds)}`
          }
          title={`Logged ${periodSummary}`}
        >
          {totalSeconds === null ? "—" : formatDurationShort(totalSeconds)}
        </span>
        <div className="flex items-center gap-1.5">
          {isListView ? (
            <ListRangePicker
              value={listRangeKey}
              customSince={listRangeSince}
              customUntil={listRangeUntil}
              onChange={onListRangeChange}
            />
          ) : (
            <>
              <div className="flex items-center" data-slot="period-nav">
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
            </>
          )}
          {/* One "back to now" control for every view, including the list —
              which previously had none, so leaving Split stranded it on
              "Custom range · Monday, Aug 17" with the dropdown as the only way
              home. "Today" has always meant "the period containing today"
              (it returns a week view to this week), so pointing the list at
              This week is the same promise, not a new one.

              Redundant once the visible period already contains now. Disabled
              rather than hidden so the toolbar doesn't reflow as you step
              through periods; `invisible` (not `hidden`) when the label itself
              already says "Today" — same reserved box, no duplicated word, and
              out of the a11y tree. */}
          {/* Deliberately visible-but-disabled when the period already contains
              today, never hidden. An earlier pass made it `invisible` +
              `aria-hidden` to avoid the label reading "Today Today" beside the
              h1 — which traded an affordance for a cosmetic nit, and fired at
              exactly the wrong moment: switching to Split collapses the period
              to a single day, so the one period control vanished from both the
              screen and the a11y tree just as a user would reach for it. */}
          <Button
            variant="outline"
            size="sm"
            onClick={isListView ? () => onListRangeChange("thisWeek") : onToday}
            disabled={periodIncludesToday}
          >
            Today
          </Button>
          {/* Names the effect, not the cause. "narrow pane" described the
              app's own layout state — a fact about the container, offered to a
              user who asked for a week and got five days. The full sentence
              already lives in the View options popover; this is its short form
              in the same vocabulary. */}
          {densityReduced && (
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-muted-foreground"
              title={`The pane is too narrow for ${VIEW_LABELS[requestedCalendarView]}.`}
            >
              Showing {VIEW_LABELS[calendarView]}
            </span>
          )}
        </div>

        <PaneActions>
          {planControl}
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

          {/* Drafting starts from the Add menu; the header only speaks up
              while drafting runs or proposals are waiting to be reviewed. */}
          {(draftPending || draftCount > 0) && (
            <DraftDayButton
              onClick={onDraftDay}
              pending={draftPending}
              pendingCount={draftCount}
            />
          )}
          {view === "timesheet" && (
            <SegmentedControl
              label="Timesheet shows"
              value={timesheetMode}
              onChange={onTimesheetModeChange}
              options={[
                { value: "logged", label: "Logged" },
                { value: "planned", label: "Plan" },
              ]}
            />
          )}
          <TimerViewSwitcher view={view} onChange={onViewChange} />

          {/* Split control, as one pill: Add entry is the primary action here
              and stays a single click; drafting the day and AI quick-add sit
              behind the caret. The pill is the header's one red element. */}
          <div className="flex items-center overflow-hidden rounded-full bg-primary text-primary-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="rounded-r-none pl-3 pr-2.5"
                  onClick={onAddEntry}
                  aria-label="Add entry"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add entry</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="icon-sm"
                  className="w-7 rounded-l-none border-l border-primary-foreground/25"
                  aria-label="More ways to add"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onDraftDay} disabled={draftPending}>
                  <Wand2 className="mr-2 h-3.5 w-3.5" />
                  Draft {draftDayLabel}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onAiQuickAdd}>
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Quick add…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </PaneActions>
      </div>

    </PaneHeader>
  );
}
