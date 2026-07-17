import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { TimeOfDayInput } from "./TimeOfDayInput";
import { dateDelta, shiftDate, toDateInputValue, formatShortDate, isToday, isYesterday } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

interface TimeRangePopoverProps {
  start: string;
  stop: string;
  onChange: (data: { start: string; stop: string }) => void;
  children: ReactNode;
  triggerClassName?: string;
}

function relativeDateLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return formatShortDate(iso);
}

// Quick inline editor for an entry's start/stop, opened by clicking its time
// range in the list — a Popover combining Start/Stop time fields with a
// Calendar for the date, mirroring Toggl's own row-level time-range editor.
// Every change saves immediately (no separate confirm step), matching how
// TimeOfDayInput already commits on blur elsewhere in the app.
export function TimeRangePopover({ start, stop, onChange, children, triggerClassName }: TimeRangePopoverProps) {
  const [open, setOpen] = useState(false);

  const handleStartChange = (iso: string | null) => {
    if (iso) onChange({ start: iso, stop });
  };
  const handleStopChange = (iso: string | null) => {
    if (iso) onChange({ start, stop: iso });
  };

  // Moves both start and stop by the same day delta, preserving each's
  // time-of-day (and so the entry's duration and any overnight span) — same
  // convention as EntryForm's Date field.
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const deltaDays = dateDelta(start, toDateInputValue(date));
    if (deltaDays === 0) return;
    onChange({ start: shiftDate(start, deltaDays), stop: shiftDate(stop, deltaDays) });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("rounded transition-colors hover:bg-accent/50", triggerClassName)}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <div className="flex gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Start
              <span className="text-primary">{relativeDateLabel(start)}</span>
            </div>
            <TimeOfDayInput
              value={start}
              fallbackIso={start}
              onChange={handleStartChange}
              className="h-8 w-24"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Stop</div>
            <TimeOfDayInput
              value={stop}
              fallbackIso={stop}
              onChange={handleStopChange}
              className="h-8 w-24"
            />
          </div>
        </div>
        <Calendar
          mode="single"
          selected={new Date(start)}
          onSelect={handleDateSelect}
          className="mt-2 p-0"
        />
      </PopoverContent>
    </Popover>
  );
}
