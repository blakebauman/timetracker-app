import type { CalendarOptions } from "@fullcalendar/react";
import { cn } from "@/lib/utils";
import type { CalendarEventExtendedProps } from "@/lib/calendarMapping";

/*
 * FullCalendar 7 ships no theme and no stable `.fc-*` class names — every part
 * of the grid is styled through a `*Class` option instead. This is that layer
 * for the two view families the app uses (timeGrid, dayGrid month), adapted
 * from FullCalendar's shadcn "classic" flavour onto the app's tokens.
 *
 * Event chrome that depends on the event's kind (entry / running / ghost / gap /
 * draft / planned) stays in styles/fullcalendar.css, keyed off the `tt-event-*`
 * classes `eventClass` below adds — v7 exposes the event's colour to CSS as
 * `--fc-event-color`, and the per-kind tint is a mix of it.
 *
 * The `tt-fc-*` classes carry no style: they are stable hooks for the e2e
 * suite, which can no longer select on FullCalendar's (now minified) classes.
 */

// Neutral, not brand red: the today column is a full-height fill, and the One
// Accent Rule forbids the accent as a large background. The now-indicator
// stays red — that one is precise and earned.
const dayClass = (info: { isToday: boolean; isDisabled: boolean }) =>
  cn(
    "border border-border",
    info.isDisabled ? "bg-foreground/3" : info.isToday && "bg-foreground/4"
  );

const kindClass = (props: CalendarEventExtendedProps) => {
  if (props.gap) return "tt-event-gap";
  if (props.ghost) return "tt-event-ghost";
  if (props.draft) return "tt-event-draft";
  if (props.task) return "tt-event-planned";
  return props.running && "tt-event-running";
};

const headerInk = "font-medium text-muted-foreground";

export const calendarClassOptions: CalendarOptions = {
  className: "font-sans text-foreground",
  viewClass: "border border-border",

  /* Events (both views) */
  eventClass: (info) =>
    cn(
      "tt-event",
      kindClass(info.event.extendedProps as CalendarEventExtendedProps),
      info.isSelected && "ring-[3px] ring-ring/50",
      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    ),
  blockEventClass: (info) =>
    cn("group relative", info.isDragging && !info.isSelected && "opacity-75"),
  highlightClass: "bg-primary/14",

  /* Day header */
  dayHeaderAlign: "center",
  dayHeaderClass: "tt-fc-day-header border border-border justify-center",
  dayHeaderInnerClass: cn("mx-1 my-2.5", headerInk),
  dayHeaderDividerClass: "border-b border-border",

  /* Misc table */
  tableHeaderClass: "bg-background",
  fillerClass: "border border-border",
  dayHeaderRowClass: "border border-border",
  dayRowClass: "border border-border",
  slotHeaderRowClass: "border border-border",

  views: {
    timeGrid: {
      dayLaneClass: (info) => cn("tt-fc-lane", dayClass(info), info.isFuture && "tt-fc-future"),
      dayLaneInnerClass: (info) => (info.isStack ? "m-1" : "mx-0.5"),
      slotLaneClass: (info) => cn("tt-fc-slot border border-border", info.isMinor && "border-dotted"),

      slotHeaderClass: "border border-border justify-end",
      slotHeaderInnerClass: cn("mx-1 my-0.5", headerInk),
      slotHeaderDividerClass: "border-e border-border",

      // A block: rounded, tinted, a 3px project-colour spine on the start edge.
      columnEventClass: (info) =>
        cn(
          "rounded-sm border-s-3 overflow-hidden",
          "ring ring-background",
          !info.isEnd && "rounded-b-none",
          !info.isStart && "rounded-t-none",
          info.isEnd && "mb-px"
        ),
      columnEventInnerClass: "tt-event-main h-full px-1.5 py-0.5 text-foreground",
      columnEventBeforeClass: (info) =>
        cn(info.isStartResizable && "absolute inset-x-0 -top-1 hidden h-2 group-hover:block"),
      columnEventAfterClass: (info) =>
        cn(info.isEndResizable && "absolute inset-x-0 -bottom-1 hidden h-2 group-hover:block"),

      nowIndicatorLineClass: "border-t-2 border-primary",
      nowIndicatorHeaderClass:
        "start-0 -mt-[5px] border-y-[5px] border-y-transparent border-s-[6px] border-s-primary",
    },

    dayGrid: {
      dayCellClass: (info) => cn("tt-fc-day-cell", dayClass(info)),
      dayCellTopClass: "flex flex-row justify-end",
      dayCellTopInnerClass: (info) =>
        cn("mx-1.5 my-1 whitespace-nowrap", info.isOther ? "text-muted-foreground" : "text-foreground"),
      dayCellBottomClass: "min-h-px",

      // Timed entries render as list items; the custom content carries the
      // project colour, so FullCalendar's own dot would say it twice.
      listItemEventClass: "tt-event-item mx-0.5 mb-px rounded-sm p-0.5",
      listItemEventBeforeClass: "hidden",
      listItemEventInnerClass: "min-w-0 flex-1 text-foreground",

      rowEventClass: (info) =>
        cn(
          "mb-px border-s-3 overflow-hidden",
          info.isStart && "ms-0.5 rounded-s-sm",
          info.isEnd && "me-0.5 rounded-e-sm"
        ),
      rowEventInnerClass: "tt-event-main min-w-0 flex-1 px-1 py-0.5 text-foreground",

      rowMoreLinkClass: "mx-0.5 mb-px rounded-sm hover:bg-foreground/5",
      rowMoreLinkInnerClass: "p-0.5 text-xs text-muted-foreground",
    },
  },
};
