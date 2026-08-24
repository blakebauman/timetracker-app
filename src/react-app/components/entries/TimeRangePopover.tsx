import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { TimeOfDayInput } from "./TimeOfDayInput";
import { dateDelta, shiftDate, toDateInputValue, formatShortDate, isToday, isYesterday } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

interface TimeRangePopoverProps {
  start: string;
  /** Null for a running entry — Start and the date stay editable, Stop doesn't exist yet. */
  stop: string | null;
  onChange: (data: { start: string; stop: string | null }) => void;
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
    onChange({
      start: shiftDate(start, deltaDays),
      stop: stop ? shiftDate(stop, deltaDays) : null,
    });
    // The entry now belongs to a different day, so this row — and this popover
    // with it — is about to unmount. Close first so it reads as "done", not as
    // the editor being yanked away mid-edit; EntryRow flashes the row in its
    // new day so the move is legible.
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative rounded transition-colors duration-fast ease-out-quart before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:bg-accent/50",
            triggerClassName
          )}
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
              ariaLabel="Start time"
            />
          </div>
          {/* A running entry has no stop yet — show why the field is absent
              rather than an empty box that looks broken. */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Stop</div>
            {stop ? (
              <TimeOfDayInput
                value={stop}
                fallbackIso={stop}
                onChange={handleStopChange}
                className="h-8 w-24"
                ariaLabel="Stop time"
              />
            ) : (
              <div className="flex h-8 w-24 items-center text-xs text-muted-foreground">
                Still running
              </div>
            )}
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
