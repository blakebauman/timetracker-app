import { forwardRef, useCallback, useMemo, useState } from "react";
import FullCalendar, {
  type CalendarRef,
  type DateClickInfo,
  type DateSelectInfo,
  type DayCellInfo,
  type DayLaneInfo,
  type ViewOptions,
  type DatesSetInfo,
  type DropInfo,
  type EventClickInfo,
  type EventDropInfo,
  type EventInput,
  type EventResizeDoneInfo,
} from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import "@fullcalendar/react/skeleton.css";
import { CalendarEventContent } from "./CalendarEventContent";
import { calendarClassOptions, dayCellClass, dayLaneClass } from "./calendarClasses";
import { useDaysOffMap } from "@/hooks/useDaysOff";
import { dateToLocalDate } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";

// Option objects are module constants so FullCalendar doesn't re-diff a fresh
// copy of each on every parent render.
const PLUGINS = [timeGridPlugin, dayGridPlugin, interactionPlugin];
// A work-week (5-day) view alongside the built-in week/day/month views.
const VIEWS = {
  ...calendarClassOptions.views,
  timeGridFiveDay: { type: "timeGrid", duration: { days: 5 } },
};
const DAY_HEADER_FORMAT = { weekday: "short", day: "numeric" } as const;
const TIME_FORMAT_12H = { hour: "numeric", minute: "2-digit", hour12: true, meridiem: true } as const;
const TIME_FORMAT_24H = { hour: "2-digit", minute: "2-digit", hour12: false, meridiem: false } as const;

/**
 * Where the grid opens: the start of the working day in the morning, and an
 * hour before now once the day is under way. A fixed 08:00 put the rest of
 * today's plan below the fold every afternoon — the part of the day still to
 * act on. Taken once per mount: a scroll that followed the clock would yank the
 * grid out from under someone reading it.
 */
function initialScrollTime(now = new Date()) {
  const hour = Math.max(8, now.getHours() - 1);
  return `${String(hour).padStart(2, "0")}:00:00`;
}

export type CalendarViewType =
  | "timeGridWeek"
  | "timeGridFiveDay"
  | "timeGridDay"
  | "dayGridMonth";

interface CalendarViewProps {
  initialView: CalendarViewType;
  initialDate?: Date;
  slotHeight: number;
  firstDay: number;
  weekends: boolean;
  /** Mirrors uiStore.timeFormat so the grid can't disagree with the list. */
  timeFormat: "24h" | "12h";
  events: EventInput[];
  onSelect: (startIso: string, stopIso: string) => void;
  onDateClick: (startIso: string) => void;
  onEventDrop: (arg: EventDropInfo) => void;
  onEventResize: (arg: EventResizeDoneInfo) => void;
  onEventClick: (arg: EventClickInfo) => void;
  onDatesSet: (arg: DatesSetInfo) => void;
  /**
   * An element dragged in from outside the grid (a task from the rail) was
   * dropped on it. Absent means the grid isn't a drop target at all — the
   * pointer shouldn't advertise an affordance that leads nowhere.
   */
  onExternalDrop?: (arg: DropInfo) => void;
}

// Presentational FullCalendar wrapper. All persistence lives in the parent page;
// this component only translates FC callbacks into typed intents. The forwarded
// ref exposes the FullCalendar instance so the toolbar can drive prev/next/view.
export const CalendarView = forwardRef<CalendarRef, CalendarViewProps>(
  function CalendarView(
    {
      initialView,
      initialDate,
      slotHeight,
      firstDay,
      weekends,
      timeFormat,
      events,
      onSelect,
      onDateClick,
      onEventDrop,
      onEventResize,
      onEventClick,
      onDatesSet,
      onExternalDrop,
    },
    ref
  ) {
    // FullCalendar's locale default rendered 13:00 as "1:00" — 12-hour with no
    // meridiem — while EntryRow honoured the user's preference and showed
    // "13:00". In Split both are on screen for the same entry, and on a billing
    // tool two authoritative clocks disagreeing is a trust problem.
    //
    // Match EntryRow's *output*, not just its 12/24-hour choice: it formats via
    // date-fns "h:mm a" / "HH:mm", so 13:00 reads "1:00 PM" or "13:00". FC's
    // 2-digit + short-meridiem default gives "01:00pm" — the same instant in a
    // third notation.
    const timeFmt = timeFormat === "12h" ? TIME_FORMAT_12H : TIME_FORMAT_24H;
    const [scrollTime] = useState(initialScrollTime);
    const handleSelect = useCallback(
      (arg: DateSelectInfo) => onSelect(arg.start.toISOString(), arg.end.toISOString()),
      [onSelect]
    );
    // Booked days off are hatched on the grid, so a week of leave reads as one
    // at a glance rather than as five empty days that look like lost time.
    const daysOff = useDaysOffMap();
    const views = useMemo(() => {
      if (daysOff.size === 0) return VIEWS;
      const off = (date: Date) => {
        const portion = daysOff.get(dateToLocalDate(date));
        return portion && (portion === "full" ? "tt-fc-off" : "tt-fc-off tt-fc-off-half");
      };
      const { timeGrid, dayGrid } = calendarClassOptions.views as Record<string, ViewOptions>;
      return {
        ...VIEWS,
        timeGrid: { ...timeGrid, dayLaneClass: (info: DayLaneInfo) => cn(dayLaneClass(info), off(info.date)) },
        dayGrid: { ...dayGrid, dayCellClass: (info: DayCellInfo) => cn(dayCellClass(info), off(info.date)) },
      };
    }, [daysOff]);
    const handleDateClick = useCallback(
      (arg: DateClickInfo) => onDateClick(arg.date.toISOString()),
      [onDateClick]
    );

    return (
      <div className="tt-calendar min-h-0 flex-1">
        <FullCalendar
          {...calendarClassOptions}
          ref={ref}
          plugins={PLUGINS}
          initialView={initialView}
          initialDate={initialDate}
          views={views}
          headerToolbar={false}
          height="100%"
          timeZone="local"
          firstDay={firstDay}
          weekends={weekends}
          allDaySlot={false}
          nowIndicator
          slotDuration="00:30:00"
          // Driven by the zoom control; expandRows stretches past it when the
          // pane is taller than the day.
          slotMinHeight={slotHeight}
          snapDuration="00:15:00"
          scrollTime={scrollTime}
          eventTimeFormat={timeFmt}
          slotHeaderFormat={timeFmt}
          expandRows
          dayHeaderFormat={DAY_HEADER_FORMAT}
          selectable
          selectMirror
          editable
          eventStartEditable
          eventDurationEditable
          events={events}
          eventContent={CalendarEventContent}
          select={handleSelect}
          dateClick={handleDateClick}
          eventDrop={onEventDrop}
          eventResize={onEventResize}
          eventClick={onEventClick}
          datesSet={onDatesSet}
          droppable={Boolean(onExternalDrop)}
          drop={onExternalDrop}
        />
      </div>
    );
  }
);
