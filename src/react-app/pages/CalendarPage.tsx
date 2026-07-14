import { useMemo, useRef, useState, useEffect } from "react";
import type FullCalendar from "@fullcalendar/react";
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { CalendarView, type CalendarViewType } from "@/components/calendar/CalendarView";
import { CalendarCreateDialog } from "@/components/calendar/CalendarCreateDialog";
import { EntryForm, type EditableEntry } from "@/components/entries/EntryForm";
import { useEntriesRange, useUpdateEntry } from "@/hooks/useEntries";
import { useTimerStore } from "@/stores/timerStore";
import { buildEvents, type CalendarEventExtendedProps } from "@/lib/calendarMapping";

import "@/styles/fullcalendar.css";

// A sensible default block for the "Add entry" button: 1 hour starting at the
// current time snapped to the nearest 15 minutes.
function defaultRange(): { start: string; stop: string } {
  const start = new Date();
  start.setMinutes(Math.round(start.getMinutes() / 15) * 15, 0, 0);
  const stop = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), stop: stop.toISOString() };
}

export function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);
  const [view, setView] = useState<CalendarViewType>("timeGridWeek");
  const [title, setTitle] = useState("");
  const [range, setRange] = useState(() => {
    const now = new Date();
    return {
      start: startOfWeek(now, { weekStartsOn: 1 }),
      end: endOfWeek(now, { weekStartsOn: 1 }),
    };
  });

  // Advance "now" every minute so the running entry's live block grows.
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data: entries = [] } = useEntriesRange(
    range.start.toISOString(),
    range.end.toISOString()
  );
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const updateEntry = useUpdateEntry();

  const events = useMemo(
    () => buildEvents(entries, runningEntry, range, nowIso),
    [entries, runningEntry, range, nowIso]
  );

  // Create + edit dialog state.
  const [createOpen, setCreateOpen] = useState(false);
  const [createRange, setCreateRange] = useState(defaultRange);
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null);

  const api = () => calendarRef.current?.getApi();

  const handleDatesSet = (arg: DatesSetArg) => {
    setRange({ start: arg.start, end: arg.end });
    setTitle(arg.view.title);
    setView(arg.view.type as CalendarViewType);
  };

  const handleSelect = (startIso: string, stopIso: string) => {
    setCreateRange({ start: startIso, stop: stopIso });
    setCreateOpen(true);
  };

  // Clicking an empty slot creates a default 1-hour block starting at that time.
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
    const { entry } = arg.event.extendedProps as CalendarEventExtendedProps;
    setEditEntry(entry);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <CalendarToolbar
        title={title}
        view={view}
        onPrev={() => api()?.prev()}
        onNext={() => api()?.next()}
        onToday={() => api()?.today()}
        onViewChange={(v) => api()?.changeView(v)}
        onAdd={() => {
          setCreateRange(defaultRange());
          setCreateOpen(true);
        }}
      />

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        <CalendarView
          ref={calendarRef}
          // Constant — driving this from changing state re-initializes FullCalendar
          // and breaks declarative event updates after a view switch. View changes
          // go through the API (toolbar); `view` state only tracks the active button.
          initialView="timeGridWeek"
          events={events}
          onSelect={handleSelect}
          onDateClick={handleDateClick}
          onEventDrop={handleMoveOrResize}
          onEventResize={handleMoveOrResize}
          onEventClick={handleEventClick}
          onDatesSet={handleDatesSet}
        />
      </Card>

      <CalendarCreateDialog
        open={createOpen}
        startIso={createRange.start}
        stopIso={createRange.stop}
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
