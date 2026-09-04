import type { CSSProperties } from "react";
import type { EventContentArg } from "@fullcalendar/core";
import { CalendarPlus, Wand2 } from "lucide-react";
import { formatDurationShort } from "@/lib/dateUtils";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import type { CalendarEventExtendedProps } from "@/lib/calendarMapping";

// Custom renderer for a calendar block. Passed to FullCalendar's `eventContent`.
// Kept intentionally compact so short (15–30 min) blocks stay legible.
export function CalendarEventContent(arg: EventContentArg) {
  const { entry, running, ghost, external, gap, draft } =
    arg.event.extendedProps as Partial<CalendarEventExtendedProps>;

  // Untracked gap between two entries — reads as a subtle "fill me" affordance.
  //
  // Labelled with the duration, not the range. A calendar block already encodes
  // its start and end in where it sits and how tall it is, so "Track 09:30 -
  // 11:15" spent its whole width restating the geometry — and in a narrow pane
  // (Split, or a phone) it truncated to "Track 0…", which is a label with no
  // information left in it. The duration is the one fact the block's position
  // doesn't already give you, and it fits at any width.
  if (gap) {
    const gapMs =
      arg.event.start && arg.event.end
        ? arg.event.end.getTime() - arg.event.start.getTime()
        : 0;
    return (
      <div
        className="tt-on-tint-muted flex h-full items-center gap-1 overflow-hidden px-1 text-left leading-tight"
        title={`Track ${arg.timeText}`}
      >
        <CalendarPlus className="h-3 w-3 shrink-0" />
        <span className="truncate text-xs font-medium">
          {gapMs > 0 ? formatDurationShort(gapMs / 1000) : "Track"}
        </span>
      </div>
    );
  }

  // Draft = a proposed entry waiting for review. Reads like a real block (it
  // carries a project and a description) but with the wand marking it as
  // something the app wrote rather than something the user tracked.
  if (draft) {
    const draftColor = draft.projectColor ?? DEFAULT_PROJECT_COLOR;
    return (
      <div className="flex h-full flex-col gap-0.5 overflow-hidden text-left leading-tight">
        <div className="flex items-center gap-1">
          <Wand2 className="tt-on-tint-muted h-3 w-3 shrink-0" />
          <span className="truncate text-xs font-medium">
            {draft.description || "Untracked time"}
          </span>
        </div>
        <span className="tt-on-tint-muted truncate text-micro">
          {arg.timeText} · draft
        </span>
        {draft.projectName && (
          <span
            className="tt-swatch-ink truncate text-micro font-medium"
            style={{ "--swatch": draftColor } as CSSProperties}
          >
            {draft.projectName}
          </span>
        )}
      </div>
    );
  }

  // Ghost = an unconfirmed external calendar event. Muted look + a "click to
  // track" affordance so it reads as an action, not a real tracked block.
  if (ghost) {
    return (
      <div className="flex h-full flex-col gap-0.5 overflow-hidden text-left leading-tight opacity-90">
        <div className="flex items-center gap-1">
          <CalendarPlus className="tt-on-tint-muted h-3 w-3 shrink-0" />
          <span className="truncate text-xs font-medium">{external?.title ?? "(no title)"}</span>
        </div>
        <span className="tt-on-tint-muted truncate text-micro">
          {arg.timeText} · click to track
        </span>
      </div>
    );
  }

  // Selection mirror / drag placeholder events carry no entry — render minimally
  // instead of crashing (which would break FullCalendar's React subtree).
  if (!entry) {
    return (
      <div className="px-1.5 py-1 text-xs font-medium">{arg.timeText}</div>
    );
  }
  const color = entry.projectColor ?? DEFAULT_PROJECT_COLOR;

  return (
    <div className="flex h-full flex-col gap-0.5 overflow-hidden text-left leading-tight">
      <div className="flex items-center gap-1">
        {running && (
          <span
            className="tt-running-dot h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="truncate text-xs font-medium">
          {entry.description || "(no description)"}
        </span>
      </div>
      {/* Class hooks let the block drop detail as its own width shrinks —
          see the @container rules in styles/fullcalendar.css. */}
      <div className="tt-event-meta tt-on-tint-muted flex items-center gap-1.5 whitespace-nowrap text-micro">
        <span className="font-mono">{arg.timeText}</span>
        <span className="tt-event-sep" aria-hidden>
          ·
        </span>
        <span className="tt-event-dur">
          {running ? "running" : formatDurationShort(entry.duration ?? 0)}
        </span>
      </div>
      {entry.projectName && (
        <span
          className="tt-swatch-ink truncate text-micro font-medium"
          style={{ "--swatch": color } as CSSProperties}
        >
          {entry.projectName}
        </span>
      )}
    </div>
  );
}
