import type { CalendarViewType } from "@/components/calendar/CalendarView";

/**
 * Narrowest day column that still carries a readable event label. Below this the
 * container queries in styles/fullcalendar.css strip the meta line entirely, so
 * a column narrower than this is showing a block with no facts on it.
 */
export const MIN_DAY_COLUMN = 96;

/** FullCalendar's time-axis gutter, which isn't available to day columns. */
export const TIME_AXIS_GUTTER = 56;

const COLUMNS: Record<CalendarViewType, number> = {
  timeGridDay: 1,
  timeGridFiveDay: 5,
  timeGridWeek: 7,
  dayGridMonth: 7,
};

/** How many day columns fit legibly in a pane of this width. */
export function fittingColumns(paneWidth: number): number {
  return Math.max(1, Math.floor((paneWidth - TIME_AXIS_GUTTER) / MIN_DAY_COLUMN));
}

/**
 * Reduce a requested calendar view to what the pane can actually show.
 *
 * The density decision has to come from the **pane**, not the viewport. Split
 * halves the container while leaving the viewport untouched, so a viewport-based
 * rule left Split at 1280 rendering 50px columns — a 230px label in 46px, gap
 * blocks reading "Tr…". Measuring the pane fixes Split and phones with one rule,
 * and also responds to the sidebar collapsing, which no breakpoint would catch.
 *
 * Only ever reduces: a user who asked for Day never gets upgraded to Week
 * because their window is wide. Month is a dayGrid — it has no time axis and
 * stays readable at any width — so it passes through untouched.
 *
 * `paneWidth` of 0 means "not measured yet"; callers pass a viewport-derived
 * fallback so the first paint isn't chosen from a width of nothing.
 */
export function resolveCalendarDensity(
  requested: CalendarViewType,
  paneWidth: number,
  fallbackColumns: number
): CalendarViewType {
  if (requested === "dayGridMonth") return requested;

  const available = paneWidth > 0 ? fittingColumns(paneWidth) : fallbackColumns;
  const allowed = Math.min(COLUMNS[requested], available);

  if (allowed >= 7) return "timeGridWeek";
  if (allowed >= 5) return "timeGridFiveDay";
  return "timeGridDay";
}
