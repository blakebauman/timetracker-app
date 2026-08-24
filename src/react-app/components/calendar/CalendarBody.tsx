import { useMemo, useRef, useState, useEffect } from "react";
import type FullCalendar from "@fullcalendar/react";
import type { EventClickArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import {
  endOfWeek,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
} from "date-fns";
import { CalendarPlus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { CalendarView, type CalendarViewType } from "./CalendarView";
import { CalendarCreateDialog } from "./CalendarCreateDialog";
import { EntryForm, type EditableEntry } from "@/components/entries/EntryForm";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { useEntriesRange, useUpdateEntry } from "@/hooks/useEntries";
import { useCalendarEvents, useConvertCalendarRange } from "@/hooks/useCalendarSync";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import {
  buildEvents,
  buildGapEvents,
  draftToEvent,
  externalEventToEvent,
  type CalendarEventExtendedProps,
} from "@/lib/calendarMapping";
import { useDraftRange } from "@/hooks/useDrafts";
import { localDayKey } from "@/lib/dateUtils";

import "@/styles/fullcalendar.css";

interface CalendarBodyProps {
  // Start of the visible period: a week start for time-grid views, a month
  // start for the month view.
  periodStart: Date;
  calendarView: CalendarViewType;
  slotHeight: number;
  weekStartsOn: number; // 0=Sun … 6=Sat
  showWeekends: boolean;
  showGaps: boolean;
  /**
   * False in split view, where the entry list beside this grid renders its own
   * "nothing tracked" state. Two of them side by side, in near-identical
   * words, read as a rendering fault rather than an explanation.
   */
  showEmptyState?: boolean;
  /**
   * Open review for a local day. Absent means drafts aren't painted at all —
   * a proposal you can't act on is just clutter on the grid.
   */
  onReviewDay?: (localDate: string) => void;
}

// The FullCalendar grid, externally driven by the shared period + view.
// Extracted from the old standalone CalendarPage so it can be embedded in the
// unified Timer tab (calendar + split views) under one shared header.
export function CalendarBody({
  periodStart,
  calendarView,
  slotHeight,
  weekStartsOn,
  showWeekends,
  showGaps,
  showEmptyState = true,
  onReviewDay,
}: CalendarBodyProps) {
  // date-fns wants a 0–6 literal; the setting is validated to that range.
  const wso = weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const calendarRef = useRef<FullCalendar>(null);
  const api = () => calendarRef.current?.getApi();

  // Captured once — FullCalendar's initialView/initialDate must be constant;
  // subsequent view/date changes are driven imperatively via the API below.
  const [initialView] = useState<CalendarViewType>(calendarView);
  const [initialDate] = useState<Date>(periodStart);

  // Fetch range: the whole month grid (incl. leading/trailing days) for month
  // view, the single day for the day view, otherwise the full week — the 5-day
  // view just shows fewer columns of the week its header names.
  //
  // The day view must scope to `periodStart` alone, and the grid must open on
  // it rather than on today. It used to fetch the containing week and then
  // `gotoDate(today)` whenever today fell anywhere inside it, while the header,
  // the "Logged" strip, the totals and the entry pane all stayed on
  // `periodStart` — so entering Split on a past day showed "Mon, Aug 17 ·
  // Logged 5h" beside an empty Sunday grid, and the user couldn't tell which
  // pane was lying. TimerWorkspace already narrows the shared period to
  // startOfDay/endOfDay for this view, so following it is all that's needed.
  const range = useMemo(() => {
    if (calendarView === "dayGridMonth") {
      return {
        start: startOfWeek(startOfMonth(periodStart), { weekStartsOn: wso }),
        end: endOfWeek(endOfMonth(periodStart), { weekStartsOn: wso }),
      };
    }
    if (calendarView === "timeGridDay") {
      return { start: startOfDay(periodStart), end: endOfDay(periodStart) };
    }
    return { start: periodStart, end: endOfWeek(periodStart, { weekStartsOn: wso }) };
  }, [periodStart, calendarView, wso]);

  // Drive FullCalendar imperatively when the shared period or view changes.
  useEffect(() => {
    const a = api();
    if (!a) return;
    if (a.view.type !== calendarView) a.changeView(calendarView);
    a.gotoDate(periodStart);
  }, [calendarView, periodStart]);

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
    refetch: refetchEntries,
  } = useEntriesRange(range.start.toISOString(), range.end.toISOString());

  const timeFormat = useUIStore((s) => s.timeFormat);
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const updateEntry = useUpdateEntry();

  const { data: externalEvents = [] } = useCalendarEvents(
    range.start.toISOString(),
    range.end.toISOString()
  );

  // Drafts are stored against the user's LOCAL date, so the range is asked for
  // in those terms rather than as UTC instants.
  const { data: drafts = [] } = useDraftRange(
    localDayKey(range.start.toISOString()),
    localDayKey(range.end.toISOString()),
    Boolean(onReviewDay)
  );

  const { events, ghostCount } = useMemo(() => {
    const real = buildEvents(entries, runningEntry, range, nowIso);
    const confirmed = new Set(
      entries.map((e) => e.calendarEventId).filter(Boolean) as string[]
    );
    const unconfirmed = externalEvents.filter((ext) => !confirmed.has(ext.calendarEventId));
    const ghosts = unconfirmed.map(externalEventToEvent);
    // A drafted meeting and its ghost are the same hour twice — the draft is the
    // better of the two (it carries a project and a description), so it wins.
    const draftedEventIds = new Set(
      drafts.map((d) => d.calendarEventId).filter(Boolean) as string[]
    );
    const visibleGhosts = ghosts.filter(
      (g) => !draftedEventIds.has(String(g.id).replace(/^ghost:/, ""))
    );
    const draftBlocks = drafts.map(draftToEvent);
    // Gaps only make sense on the time grid, not the month overview.
    const allGaps =
      showGaps && calendarView !== "dayGridMonth" ? buildGapEvents(entries, nowIso) : [];
    // A gap that has already been drafted is the same hour asking to be filled
    // twice — once as "Track 09:00–11:30" and once as the proposal that answers
    // it. The proposal wins: it carries a project, a description, and a way to
    // confirm. Left in, the two blocks also split the column and truncated each
    // other's only label.
    const gaps = allGaps.filter((gap) => {
      const gapStart = new Date(gap.start as string).getTime();
      const gapStop = new Date(gap.end as string).getTime();
      return !drafts.some(
        (d) =>
          gapStart < new Date(d.stop).getTime() && gapStop > new Date(d.start).getTime()
      );
    });
    return {
      events: [...gaps, ...draftBlocks, ...real, ...visibleGhosts],
      // What the "Convert N events" button offers to do — the ghosts still on
      // screen, not every unconfirmed event (a drafted one is already handled).
      ghostCount: visibleGhosts.length,
    };
  }, [entries, runningEntry, range, nowIso, externalEvents, showGaps, calendarView, drafts]);

  const convertRange = useConvertCalendarRange();
  const handleConvertAll = () =>
    convertRange.mutate({
      since: range.start.toISOString(),
      until: range.end.toISOString(),
    });

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
    if (props.draft) {
      onReviewDay?.(props.draft.localDate);
      return;
    }
    if (props.gap && props.gapRange) {
      setCreateRange({ start: props.gapRange.start, stop: props.gapRange.stop });
      setCreateOpen(true);
      return;
    }
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
        <div className="absolute inset-0 z-sticky flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
          <Spinner size="lg" className="text-muted-foreground" />
        </div>
      )}

      {/* A failed fetch used to render as an ordinary empty grid — visually
          identical to a week with nothing tracked. Overlay rather than replace,
          so the dates stay on screen as context. */}
      {entriesError && !entriesLoading && (
        <div className="absolute inset-0 z-overlay flex items-center justify-center bg-background/85 p-4 backdrop-blur-[1px]">
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load this period"
            description="The request didn't get through. Your tracked time is safe."
            action={
              <Button variant="outline" size="sm" onClick={() => refetchEntries()}>
                Try again
              </Button>
            }
            className="py-0"
          />
        </div>
      )}

      {/* Nothing tracked: the grid alone gives no hint that it's empty *because
          you haven't logged anything*, versus still loading or broken. */}
      {showEmptyState && !entriesLoading && !entriesError && events.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-sticky flex items-center justify-center p-4">
          <div className="pointer-events-auto">
            <EmptyState
              icon={CalendarPlus}
              title="Nothing tracked in this period"
              description="Click any empty slot to log time, or start the timer to track as you work."
              className="rounded-xl border bg-background/95 px-8 py-8 shadow-sm"
            />
          </div>
        </div>
      )}

      {ghostCount > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute right-4 top-3 z-overlay gap-1.5 shadow-sm"
          onClick={handleConvertAll}
          disabled={convertRange.isPending}
          title="Add every calendar event in view as a time entry"
        >
          {convertRange.isPending ? (
            <Spinner size="sm" />
          ) : (
            <CalendarPlus className="h-3.5 w-3.5" />
          )}
          Convert {ghostCount} {ghostCount === 1 ? "event" : "events"}
        </Button>
      )}
      <CalendarView
        ref={calendarRef}
        initialView={initialView}
        initialDate={initialDate}
        slotHeight={slotHeight}
        firstDay={weekStartsOn}
        weekends={showWeekends}
        timeFormat={timeFormat}
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
