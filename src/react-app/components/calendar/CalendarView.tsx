import { forwardRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
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

export type CalendarViewType = "timeGridWeek" | "timeGridDay";

interface CalendarViewProps {
  initialView: CalendarViewType;
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
    return (
      <div className="tt-calendar min-h-0 flex-1">
        <FullCalendar
          ref={ref}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView={initialView}
          headerToolbar={false}
          height="100%"
          timeZone="local"
          firstDay={1}
          allDaySlot={false}
          nowIndicator
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          scrollTime="08:00:00"
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
