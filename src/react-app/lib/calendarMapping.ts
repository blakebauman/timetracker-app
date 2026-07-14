import type { EventInput } from "@fullcalendar/core";
import type { TimeEntry } from "@shared/schemas";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import { hexToRgba } from "@/lib/colorUtils";

// A FullCalendar event carries the originating TimeEntry so interaction handlers
// (drop/resize/click) can read its id and fields without a lookup.
export interface CalendarEventExtendedProps {
  entry: TimeEntry;
  running: boolean;
}

// Map a TimeEntry to a FullCalendar event. Running entries (stop === null) are
// rendered live up to `now` and made non-draggable/non-resizable since they're
// still ticking — a move/resize would be meaningless until the timer stops.
export function entryToEvent(entry: TimeEntry, nowIso: string): EventInput {
  const running = entry.stop == null;
  const color = entry.projectColor ?? DEFAULT_PROJECT_COLOR;
  return {
    id: entry.id,
    start: entry.start,
    end: entry.stop ?? nowIso,
    editable: !running,
    // FullCalendar paints the block; the custom eventContent renderer draws the
    // label. A translucent fill with a solid left border reads well in both themes.
    backgroundColor: hexToRgba(color, 0.16),
    borderColor: color,
    extendedProps: { entry, running } satisfies CalendarEventExtendedProps,
  };
}

// Build the event list for a visible range: every fetched entry, plus the
// running entry when it starts within the window and isn't already included
// (the range fetch may exclude it if it started before `since`).
export function buildEvents(
  entries: TimeEntry[],
  runningEntry: TimeEntry | null,
  range: { start: Date; end: Date },
  nowIso: string
): EventInput[] {
  const events = entries.map((e) => entryToEvent(e, nowIso));
  if (runningEntry && !entries.some((e) => e.id === runningEntry.id)) {
    const startMs = new Date(runningEntry.start).getTime();
    if (startMs >= range.start.getTime() && startMs < range.end.getTime()) {
      events.push(entryToEvent(runningEntry, nowIso));
    }
  }
  return events;
}
