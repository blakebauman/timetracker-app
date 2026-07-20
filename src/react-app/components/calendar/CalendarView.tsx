import { forwardRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  EventInput,
  DateSelectArg,
  EventClickArg,
  DatesSetArg,
  EventDropArg,
} from "@fullcalendar/core";
import type { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import { CalendarEventContent } from "./CalendarEventContent";
import type { CalendarEventExtendedProps } from "@/lib/calendarMapping";

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
  onEventDrop: (arg: EventDropArg) => void;
  onEventResize: (arg: EventResizeDoneArg) => void;
  onEventClick: (arg: EventClickArg) => void;
  onDatesSet: (arg: DatesSetArg) => void;
}

// Presentational FullCalendar wrapper. All persistence lives in the parent page;
// this component only translates FC callbacks into typed intents. The forwarded
// ref exposes the FullCalendar instance so the toolbar can drive prev/next/view.
export const CalendarView = forwardRef<FullCalendar, CalendarViewProps>(
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
      <div
        className="tt-calendar min-h-0 flex-1"
        style={{ ["--fc-slot-height" as string]: `${slotHeight}px` }}
      >
        <FullCalendar
          ref={ref}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={initialView}
          initialDate={initialDate}
          // A work-week (5-day) view alongside the built-in week/day/month views.
          views={{
            timeGridFiveDay: {
              type: "timeGrid",
              duration: { days: 5 },
              buttonText: "5 days",
            },
          }}
          headerToolbar={false}
          height="100%"
          timeZone="local"
          firstDay={firstDay}
          weekends={weekends}
          allDaySlot={false}
          nowIndicator
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          scrollTime="08:00:00"
          eventTimeFormat={timeFmt}
          slotLabelFormat={timeFmt}
          expandRows
          dayHeaderFormat={{ weekday: "short", day: "numeric" }}
          selectable
          selectMirror
          editable
          eventStartEditable
          eventDurationEditable
          events={events}
          eventContent={CalendarEventContent}
          eventClassNames={(arg) => {
            const props = arg.event.extendedProps as CalendarEventExtendedProps;
            if (props.gap) return ["tt-event-gap"];
            if (props.ghost) return ["tt-event-ghost"];
            return props.running ? ["tt-event-running"] : [];
          }}
          select={(arg: DateSelectArg) =>
            onSelect(arg.start.toISOString(), arg.end.toISOString())
          }
          dateClick={(arg: DateClickArg) => onDateClick(arg.date.toISOString())}
          eventDrop={onEventDrop}
          eventResize={onEventResize}
          eventClick={onEventClick}
          datesSet={onDatesSet}
        />
      </div>
    );
  }
);
