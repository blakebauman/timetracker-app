import { useMemo, useRef, useState, useEffect } from "react";
import type FullCalendar from "@fullcalendar/react";
import type { EventClickArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { endOfWeek, isWithinInterval } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CalendarView, type CalendarViewType } from "./CalendarView";
import { CalendarCreateDialog } from "./CalendarCreateDialog";
import { EntryForm, type EditableEntry } from "@/components/entries/EntryForm";
import { useEntriesRange, useUpdateEntry } from "@/hooks/useEntries";
import { useCalendarEvents } from "@/hooks/useCalendarSync";
import { useTimerStore } from "@/stores/timerStore";
import {
  buildEvents,
  externalEventToEvent,
  type CalendarEventExtendedProps,
} from "@/lib/calendarMapping";

import "@/styles/fullcalendar.css";

interface CalendarBodyProps {
  weekStart: Date;
  calendarView: CalendarViewType;
  slotHeight: number;
}

// The FullCalendar time grid, externally driven by the shared week + view.
// Extracted from the old standalone CalendarPage so it can be embedded in the
// unified Timer tab (calendar + split views) under one shared header.
export function CalendarBody({ weekStart, calendarView, slotHeight }: CalendarBodyProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const api = () => calendarRef.current?.getApi();

  // Captured once — FullCalendar's initialView/initialDate must be constant;
  // subsequent view/date changes are driven imperatively via the API below.
  const [initialView] = useState<CalendarViewType>(calendarView);
  const [initialDate] = useState<Date>(weekStart);

  // Always fetch the full Mon–Sun week; day/5-day views just show fewer columns.
  const range = useMemo(
    () => ({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) }),
    [weekStart]
  );

  // For day view, focus today when it falls in the week, else the week start.
  const focusDate = useMemo(() => {
    if (calendarView !== "timeGridDay") return weekStart;
    const today = new Date();
    return isWithinInterval(today, { start: range.start, end: range.end }) ? today : weekStart;
  }, [calendarView, weekStart, range.start, range.end]);

  // Drive FullCalendar imperatively when the shared week or view changes.
  useEffect(() => {
    const a = api();
    if (!a) return;
    if (a.view.type !== calendarView) a.changeView(calendarView);
    a.gotoDate(focusDate);
  }, [calendarView, focusDate]);

  // Advance "now" every minute so the running entry's live block grows.
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);

  const {
    data: entries = [],
    isLoading: entriesLoading,
    isError: entriesError,
  } = useEntriesRange(range.start.toISOString(), range.end.toISOString());

  useEffect(() => {
    if (entriesError) toast.error("Couldn't load calendar entries");
  }, [entriesError]);

  const runningEntry = useTimerStore((s) => s.runningEntry);
  const updateEntry = useUpdateEntry();

  const { data: externalEvents = [] } = useCalendarEvents(
    range.start.toISOString(),
    range.end.toISOString()
  );

  const events = useMemo(() => {
    const real = buildEvents(entries, runningEntry, range, nowIso);
    const confirmed = new Set(
      entries.map((e) => e.calendarEventId).filter(Boolean) as string[]
    );
    const ghosts = externalEvents
      .filter((ext) => !confirmed.has(ext.calendarEventId))
      .map(externalEventToEvent);
    return [...real, ...ghosts];
  }, [entries, runningEntry, range, nowIso, externalEvents]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createRange, setCreateRange] = useState<{
    start: string;
    stop: string;
    description?: string;
    calendarEventId?: string;
  }>(() => {
    const start = new Date();
    start.setMinutes(Math.round(start.getMinutes() / 15) * 15, 0, 0);
    const stop = new Date(start.getTime() + 60 * 60 * 1000);
    return { start: start.toISOString(), stop: stop.toISOString() };
  });
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null);

  const handleSelect = (startIso: string, stopIso: string) => {
    setCreateRange({ start: startIso, stop: stopIso });
    setCreateOpen(true);
  };

  const handleDateClick = (startIso: string) => {
    const stopIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
    setCreateRange({ start: startIso, stop: stopIso });
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    api()?.unselect();
  };

  const handleMoveOrResize = (arg: EventDropArg | EventResizeDoneArg) => {
    const { start, end } = arg.event;
    if (!start || !end) {
      arg.revert();
      return;
    }
    updateEntry.mutate(
      { id: arg.event.id, data: { start: start.toISOString(), stop: end.toISOString() } },
      {
        onError: () => {
          arg.revert();
          toast.error("Couldn't update entry");
        },
      }
    );
  };

  const handleEventClick = (arg: EventClickArg) => {
    const props = arg.event.extendedProps as CalendarEventExtendedProps;
    if (props.ghost && props.external) {
      setCreateRange({
        start: props.external.start,
        stop: props.external.stop,
        description: props.external.title,
        calendarEventId: props.external.calendarEventId,
      });
      setCreateOpen(true);
      return;
    }
    if (props.entry) setEditEntry(props.entry);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-2">
      {entriesLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <CalendarView
        ref={calendarRef}
        initialView={initialView}
        initialDate={initialDate}
        slotHeight={slotHeight}
        events={events}
        onSelect={handleSelect}
        onDateClick={handleDateClick}
        onEventDrop={handleMoveOrResize}
        onEventResize={handleMoveOrResize}
        onEventClick={handleEventClick}
        onDatesSet={() => {}}
      />

      <CalendarCreateDialog
        open={createOpen}
        startIso={createRange.start}
        stopIso={createRange.stop}
        description={createRange.description}
        calendarEventId={createRange.calendarEventId}
        onClose={closeCreate}
      />

      {editEntry && (
        <EntryForm
          entry={editEntry}
          open={Boolean(editEntry)}
          onClose={() => setEditEntry(null)}
        />
      )}
    </div>
  );
}
