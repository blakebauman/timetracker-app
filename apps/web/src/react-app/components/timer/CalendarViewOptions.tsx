import { SlidersHorizontal, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SEGMENT,
  SEGMENT_ACTIVE,
  SEGMENT_INACTIVE,
  SEGMENT_TRACK,
} from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import {
  CALENDAR_SLOT_HEIGHT_MIN,
  CALENDAR_SLOT_HEIGHT_MAX,
} from "@/stores/uiStore";
import type { CalendarViewType } from "@/components/calendar/CalendarView";
import { VIEW_LABELS } from "./calendarViewLabels";

const VIEW_OPTIONS: { value: CalendarViewType; label: string }[] = [
  { value: "timeGridDay", label: "Day" },
  { value: "timeGridFiveDay", label: "5 days" },
  { value: "timeGridWeek", label: "Week" },
  { value: "dayGridMonth", label: "Month" },
];

interface CalendarViewOptionsProps {
  /** What the pane is actually rendering, after the density rule. */
  calendarView: CalendarViewType;
  /** What the user asked for; differs when the pane is too narrow. */
  requestedCalendarView: CalendarViewType;
  onCalendarViewChange: (v: CalendarViewType) => void;
  slotHeight: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showWeekends: boolean;
  onToggleWeekends: () => void;
  showGaps: boolean;
  onToggleGaps: () => void;
}

/**
 * The calendar's display preferences, behind one control. They're persisted
 * preferences you set once, not per-session actions, so they don't earn a
 * seat in the header beside "Add entry".
 */
export function CalendarViewOptions({
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
}: CalendarViewOptionsProps) {
  const isMonthView = calendarView === "dayGridMonth";
  const isDayView = calendarView === "timeGridDay";
  const reduced = calendarView !== requestedCalendarView;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="View options">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>View options</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-64 p-3">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Show</Label>
            <div
              role="radiogroup"
              aria-label="Calendar view"
              className={cn(SEGMENT_TRACK, "w-full")}
            >
              {VIEW_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={requestedCalendarView === value}
                  onClick={() => onCalendarViewChange(value)}
                  className={cn(
                    SEGMENT,
                    "flex-1 justify-center px-1 text-xs",
                    requestedCalendarView === value ? SEGMENT_ACTIVE : SEGMENT_INACTIVE
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {reduced && (
              <p className="text-xs text-muted-foreground">
                Showing {VIEW_LABELS[calendarView]} — the pane is too narrow for{" "}
                {VIEW_LABELS[requestedCalendarView]}.
              </p>
            )}
          </div>

          {!isDayView && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="opt-weekends" className="text-sm font-normal">
                Weekends
              </Label>
              <Switch
                id="opt-weekends"
                checked={showWeekends}
                onCheckedChange={onToggleWeekends}
              />
            </div>
          )}

          {!isMonthView && (
            <>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="opt-gaps" className="text-sm font-normal">
                  Untracked gaps
                </Label>
                <Switch id="opt-gaps" checked={showGaps} onCheckedChange={onToggleGaps} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-normal">Row height</Label>
                <div className="flex items-center rounded-full border bg-muted p-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onZoomOut}
                    disabled={slotHeight <= CALENDAR_SLOT_HEIGHT_MIN}
                    aria-label="Shorter rows"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onZoomIn}
                    disabled={slotHeight >= CALENDAR_SLOT_HEIGHT_MAX}
                    aria-label="Taller rows"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
