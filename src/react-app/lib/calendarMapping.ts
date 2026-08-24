import type { EventInput } from "@fullcalendar/core";
import type { TimeEntry } from "@shared/schemas";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import { hexToRgba } from "@/lib/colorUtils";

// An unconfirmed external calendar event (Google) shown as a "ghost" block the
// user can click to confirm into a tracked entry.
export interface ExternalEvent {
  calendarEventId: string;
  title: string;
  start: string;
  stop: string;
}

// A FullCalendar event carries either the originating TimeEntry (real block) or,
// for ghosts, the external event — so interaction handlers can branch without a
// lookup. `running` is always present; `entry` is absent on ghosts.
export interface CalendarEventExtendedProps {
  entry?: TimeEntry;
  running: boolean;
  ghost?: boolean;
  external?: ExternalEvent;
  // An untracked gap between two entries the user can click to fill.
  gap?: boolean;
  gapRange?: { start: string; stop: string };
}

const GHOST_COLOR = "#94a3b8"; // slate-400 — muted, project-agnostic
const GAP_COLOR = "#94a3b8";

// Build clickable "untracked gap" blocks: the empty stretches between two
// consecutive completed entries on the same day. Surfaces time you likely forgot
// to track. Only past gaps at least `minGapMs` long are shown.
/**
 * `minGapMs` defaults to 30 minutes, not 15.
 *
 * At 15 a normal week painted ten or more dashed "Track hh:mm" blocks — one in
 * every seam between meetings — and each one truncated the only fact it
 * carried. A quarter-hour between two entries is a coffee, not lost billable
 * time; half an hour is worth asking about. The affordance is only useful if it
 * isn't striping every column.
 */
export function buildGapEvents(
  entries: TimeEntry[],
  nowIso: string,
  minGapMs = 30 * 60_000
): EventInput[] {
  const now = new Date(nowIso).getTime();
  const done = entries
    .filter((e) => e.stop != null)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const gaps: EventInput[] = [];
  for (let i = 0; i < done.length - 1; i++) {
    const prevStop = new Date(done[i].stop as string);
    const nextStart = new Date(done[i + 1].start);
    const gapMs = nextStart.getTime() - prevStop.getTime();
    if (gapMs < minGapMs) continue; // too small or overlapping
    if (nextStart.getTime() > now) continue; // don't nag about the future
    // Same calendar day only — skip overnight/multi-day gaps (pure noise).
    if (prevStop.toDateString() !== nextStart.toDateString()) continue;

    const start = prevStop.toISOString();
    const stop = nextStart.toISOString();
    gaps.push({
      id: `gap:${start}`,
      start,
      end: stop,
      editable: false,
      display: "block",
      backgroundColor: hexToRgba(GAP_COLOR, 0.06),
      borderColor: hexToRgba(GAP_COLOR, 0.5),
      extendedProps: {
        running: false,
        gap: true,
        gapRange: { start, stop },
      } satisfies CalendarEventExtendedProps,
    });
  }
  return gaps;
}

// Map an external calendar event to a dashed, non-editable ghost block.
export function externalEventToEvent(ext: ExternalEvent): EventInput {
  return {
    id: `ghost:${ext.calendarEventId}`,
    start: ext.start,
    end: ext.stop,
    editable: false,
    display: "block",
    backgroundColor: hexToRgba(GHOST_COLOR, 0.1),
    borderColor: GHOST_COLOR,
    extendedProps: { running: false, ghost: true, external: ext } satisfies CalendarEventExtendedProps,
  };
}

// Map a TimeEntry to a FullCalendar event. Running entries (stop === null) are
// rendered live up to `now` and made non-draggable/non-resizable since they're
// still ticking — a move/resize would be meaningless until the timer stops.
export function entryToEvent(entry: TimeEntry, nowIso: string): EventInput {
  const running = entry.stop == null;
  const color = entry.projectColor ?? DEFAULT_PROJECT_COLOR;
  return {
    id: entry.id,
    start: entry.start,
    end: entry.stop ?? nowIso,
    editable: !running,
    // FullCalendar paints the block; the custom eventContent renderer draws the
    // label. A translucent fill with a solid left border reads well in both themes.
    backgroundColor: hexToRgba(color, 0.16),
    borderColor: color,
    extendedProps: { entry, running } satisfies CalendarEventExtendedProps,
  };
}

// Build the event list for a visible range: every fetched entry, plus the
// running entry when it starts within the window and isn't already included
// (the range fetch may exclude it if it started before `since`).
export function buildEvents(
  entries: TimeEntry[],
  runningEntry: TimeEntry | null,
  range: { start: Date; end: Date },
  nowIso: string
): EventInput[] {
  const events = entries.map((e) => entryToEvent(e, nowIso));
  if (runningEntry && !entries.some((e) => e.id === runningEntry.id)) {
    const startMs = new Date(runningEntry.start).getTime();
    if (startMs >= range.start.getTime() && startMs < range.end.getTime()) {
      events.push(entryToEvent(runningEntry, nowIso));
    }
  }
  return events;
}
