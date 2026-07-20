import { SlidersHorizontal, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CALENDAR_SLOT_HEIGHT_MIN,
  CALENDAR_SLOT_HEIGHT_MAX,
} from "@/stores/uiStore";
import type { CalendarViewType } from "@/components/calendar/CalendarView";

const VIEW_OPTIONS: { value: CalendarViewType; label: string }[] = [
  { value: "timeGridDay", label: "Day" },
  { value: "timeGridFiveDay", label: "5 days" },
  { value: "timeGridWeek", label: "Week" },
  { value: "dayGridMonth", label: "Month" },
];

interface CalendarViewOptionsProps {
  calendarView: CalendarViewType;
  onCalendarViewChange: (v: CalendarViewType) => void;
  showViewChoice: boolean;
  slotHeight: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showWeekends: boolean;
  onToggleWeekends: () => void;
  showGaps: boolean;
  onToggleGaps: () => void;
}

/**
 * The calendar's display preferences, behind one control.
 *
 * These were four separate toolbar items (weekends toggle, gaps toggle, a zoom
 * stepper, a view select) sitting at the same visual weight as "Add entry" —
 * eight of the fourteen controls in the header. They're all persisted
 * preferences you set once, not per-session actions, which is exactly the
 * "overloaded toolbar" PRODUCT.md names as an anti-reference.
 */
export function CalendarViewOptions({
  calendarView,
  onCalendarViewChange,
  showViewChoice,
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

      <PopoverContent align="end" className="w-60 p-3">
        <div className="space-y-4">
          {showViewChoice && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Show</Label>
              <div
                role="radiogroup"
                aria-label="Calendar view"
                className="grid grid-cols-4 gap-0.5 rounded-md border bg-muted/40 p-0.5"
              >
                {VIEW_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={calendarView === value}
                    onClick={() => onCalendarViewChange(value)}
                    className={cn(
                      "rounded px-1 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      calendarView === value
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                <div className="flex items-center rounded-md border bg-muted/40 p-0.5">
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
