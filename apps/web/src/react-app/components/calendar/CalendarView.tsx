import { forwardRef } from "react";
import FullCalendar, {
  type CalendarRef,
  type DateClickInfo,
  type DateSelectInfo,
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
import { calendarClassOptions } from "./calendarClasses";

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
    const hour12 = timeFormat === "12h";
    const timeFmt = hour12
      ? ({ hour: "numeric", minute: "2-digit", hour12: true, meridiem: true } as const)
      : ({ hour: "2-digit", minute: "2-digit", hour12: false, meridiem: false } as const);

    return (
      <div className="tt-calendar min-h-0 flex-1">
        <FullCalendar
          {...calendarClassOptions}
          ref={ref}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={initialView}
          initialDate={initialDate}
          // A work-week (5-day) view alongside the built-in week/day/month views.
          views={{
            ...calendarClassOptions.views,
            timeGridFiveDay: { type: "timeGrid", duration: { days: 5 } },
          }}
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
          scrollTime="08:00:00"
          eventTimeFormat={timeFmt}
          slotHeaderFormat={timeFmt}
          expandRows
          dayHeaderFormat={{ weekday: "short", day: "numeric" }}
          selectable
          selectMirror
          editable
          eventStartEditable
          eventDurationEditable
          events={events}
          eventContent={CalendarEventContent}
          select={(arg: DateSelectInfo) =>
            onSelect(arg.start.toISOString(), arg.end.toISOString())
          }
          dateClick={(arg: DateClickInfo) => onDateClick(arg.date.toISOString())}
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
