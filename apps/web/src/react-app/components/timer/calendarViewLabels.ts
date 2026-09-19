import type { CalendarViewType } from "@/components/calendar/CalendarView";

/**
 * One name per calendar view, shared by the View options radiogroup and the
 * header's reduced-density badge so the two can't drift into describing the
 * same state with different words.
 *
 * Its own module rather than an export from CalendarViewOptions: a non-component
 * export there costs the file its fast-refresh boundary.
 */
export const VIEW_LABELS: Record<CalendarViewType, string> = {
  timeGridDay: "Day",
  timeGridFiveDay: "5 days",
  timeGridWeek: "Week",
  dayGridMonth: "Month",
};
