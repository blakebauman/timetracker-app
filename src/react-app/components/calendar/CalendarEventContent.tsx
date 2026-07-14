import type { EventContentArg } from "@fullcalendar/core";
import { formatDurationShort } from "@/lib/dateUtils";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import type { CalendarEventExtendedProps } from "@/lib/calendarMapping";

// Custom renderer for a calendar block. Passed to FullCalendar's `eventContent`.
// Kept intentionally compact so short (15–30 min) blocks stay legible.
export function CalendarEventContent(arg: EventContentArg) {
  const { entry, running } = arg.event.extendedProps as Partial<CalendarEventExtendedProps>;
  // Selection mirror / drag placeholder events carry no entry — render minimally
  // instead of crashing (which would break FullCalendar's React subtree).
  if (!entry) {
    return (
      <div className="px-1.5 py-1 text-xs font-medium">{arg.timeText}</div>
    );
  }
  const color = entry.projectColor ?? DEFAULT_PROJECT_COLOR;

  return (
    <div className="flex h-full flex-col gap-0.5 overflow-hidden text-left leading-tight">
      <div className="flex items-center gap-1">
        {running && (
          <span
            className="tt-running-dot h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="truncate text-xs font-medium">
          {entry.description || "(no description)"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{arg.timeText}</span>
        <span aria-hidden>·</span>
        <span>{running ? "running" : formatDurationShort(entry.duration ?? 0)}</span>
      </div>
      {entry.projectName && (
        <span className="truncate text-[11px] font-medium" style={{ color }}>
          {entry.projectName}
        </span>
      )}
    </div>
  );
}
