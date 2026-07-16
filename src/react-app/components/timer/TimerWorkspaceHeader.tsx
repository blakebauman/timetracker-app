import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  ArrowRight,
  Minus,
  ZoomIn,
  CalendarRange,
  SquareDashedBottom,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimerViewSwitcher } from "./TimerViewSwitcher";
import {
  CALENDAR_SLOT_HEIGHT_MIN,
  CALENDAR_SLOT_HEIGHT_MAX,
  type TimerView,
} from "@/stores/uiStore";
import type { CalendarViewType } from "@/components/calendar/CalendarView";
import { formatPeriodLabel, formatDurationShort } from "@/lib/dateUtils";

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
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAddEntry: () => void;
  onAiQuickAdd: () => void;
  // Calendar sub-controls — only rendered for calendar/split views.
  calendarView: CalendarViewType;
  onCalendarViewChange: (v: CalendarViewType) => void;
  slotHeight: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showWeekends: boolean;
  onToggleWeekends: () => void;
  showGaps: boolean;
  onToggleGaps: () => void;
}

const CALENDAR_VIEW_LABELS: Record<CalendarViewType, string> = {
  timeGridDay: "Day",
  timeGridFiveDay: "5 days",
  timeGridWeek: "Week",
  dayGridMonth: "Month",
};

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
  onPrev,
  onNext,
  onToday,
  onAddEntry,
  onAiQuickAdd,
  calendarView,
  onCalendarViewChange,
  slotHeight,
  onZoomIn,
  onZoomOut,
  showWeekends,
  onToggleWeekends,
  showGaps,
  onToggleGaps,
}: TimerWorkspaceHeaderProps) {
  const showCalendarControls = view === "calendar" || view === "split";
  const isMonthView = calendarView === "dayGridMonth";

  return (
    <div className="border-b">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onPrev}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onNext}
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="h-8" onClick={onToday}>
            Today
          </Button>
          <h1 className="ml-1 text-sm font-semibold tracking-tight tabular-nums">
            {formatPeriodLabel(since, until)}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showCalendarControls && (
            <>
              {/* Show/hide weekend columns */}
              <Button
                variant={showWeekends ? "outline" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={onToggleWeekends}
                aria-pressed={showWeekends}
                title={showWeekends ? "Hide weekends" : "Show weekends"}
                aria-label={showWeekends ? "Hide weekends" : "Show weekends"}
              >
                <CalendarRange className="h-3.5 w-3.5" />
              </Button>

              {/* Show/hide untracked-gap fill markers (time grid only) */}
              {!isMonthView && (
                <Button
                  variant={showGaps ? "outline" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={onToggleGaps}
                  aria-pressed={showGaps}
                  title={showGaps ? "Hide untracked gaps" : "Show untracked gaps"}
                  aria-label={showGaps ? "Hide untracked gaps" : "Show untracked gaps"}
                >
                  <SquareDashedBottom className="h-3.5 w-3.5" />
                </Button>
              )}

              {/* Zoom (slot height) — not meaningful in the month grid */}
              {!isMonthView && (
                <div className="flex items-center rounded-md border bg-muted/40 p-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onZoomOut}
                    disabled={slotHeight <= CALENDAR_SLOT_HEIGHT_MIN}
                    aria-label="Zoom out"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onZoomIn}
                    disabled={slotHeight >= CALENDAR_SLOT_HEIGHT_MAX}
                    aria-label="Zoom in"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              <Select
                value={calendarView}
                onValueChange={(v) => onCalendarViewChange(v as CalendarViewType)}
              >
                <SelectTrigger className="h-8 w-24 text-xs" aria-label="Calendar view">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="timeGridDay">{CALENDAR_VIEW_LABELS.timeGridDay}</SelectItem>
                  <SelectItem value="timeGridFiveDay">
                    {CALENDAR_VIEW_LABELS.timeGridFiveDay}
                  </SelectItem>
                  <SelectItem value="timeGridWeek">{CALENDAR_VIEW_LABELS.timeGridWeek}</SelectItem>
                  <SelectItem value="dayGridMonth">
                    {CALENDAR_VIEW_LABELS.dayGridMonth}
                  </SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          <TimerViewSwitcher view={view} onChange={onViewChange} />

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={onAddEntry}
          >
            <Plus className="h-3.5 w-3.5" />
            Add entry
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={onAiQuickAdd}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI quick add
          </Button>
        </div>
      </div>

      {/* Logged-this-period bar */}
      <div className="flex items-center gap-3 px-4 pb-2">
        <span className="text-xs font-medium text-muted-foreground">Logged</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
          {totalSeconds > 0 &&
            segments.map((seg) => (
              <div
                key={seg.projectId ?? "none"}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(seg.seconds / totalSeconds) * 100}%`,
                  backgroundColor: seg.color,
                }}
                title={`${seg.projectName ?? "No project"} · ${formatDurationShort(seg.seconds)}`}
              />
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
