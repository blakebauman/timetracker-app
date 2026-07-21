import { useState } from "react";
import {
  dateDelta,
  shiftDate,
  toDateInputValue,
  formatSeconds,
  parseTimeInput,
} from "@/lib/dateUtils";

export interface EntryDraft {
  description: string;
  projectId: string | null;
  taskId: string | null;
  tags: string[];
  billable: boolean;
  /** ISO. Null only before the user has picked a time in the create flow. */
  start: string | null;
  /** ISO, or null for a running entry / an unfinished create. */
  stop: string | null;
}

export interface EntryDraftInit extends Partial<EntryDraft> {
  /** Calendar date the Start/Stop times hang off before either is set. */
  anchorDate?: Date;
}

const durationOf = (start: string | null, stop: string | null) =>
  start && stop
    ? Math.max(0, Math.round((new Date(stop).getTime() - new Date(start).getTime()) / 1000))
    : 0;

/**
 * Draft state for a time entry, shared by the create and edit forms.
 *
 * These three forms (header Add, calendar slot-click, row Edit) each carried
 * their own copy of this state and its coupling rules, and the copies had drifted:
 * only one of them offered a Duration field, and the date-shift logic existed in
 * two subtly different versions. Everything the fields need to stay consistent
 * lives here once:
 *
 * - Changing the **date** moves start *and* stop by the same delta, computed once
 *   from `start`. Computing it per-field would drift for an overnight entry,
 *   whose start and stop sit on different local days to begin with.
 * - Editing **duration** holds `start` and moves `stop` — the same convention as
 *   the inline edits in EntryRow and TimesheetView.
 * - The duration text resyncs whenever start/stop change from elsewhere, so the
 *   field never shows a stale value for a frame.
 */
export function useEntryDraft(init: EntryDraftInit) {
  const [draft, setDraft] = useState<EntryDraft>({
    description: init.description ?? "",
    projectId: init.projectId ?? null,
    taskId: init.taskId ?? null,
    tags: init.tags ?? [],
    billable: init.billable ?? false,
    start: init.start ?? null,
    stop: init.stop ?? null,
  });

  const [anchorDate, setAnchorDate] = useState<Date>(
    init.anchorDate ?? (init.start ? new Date(init.start) : new Date())
  );

  const [durationText, setDurationText] = useState(() =>
    formatSeconds(durationOf(draft.start, draft.stop))
  );

  // Adjust-during-render rather than an effect, matching TimeOfDayInput, so the
  // duration text is never a frame behind start/stop.
  const [synced, setSynced] = useState({ start: draft.start, stop: draft.stop });
  if (synced.start !== draft.start || synced.stop !== draft.stop) {
    setSynced({ start: draft.start, stop: draft.stop });
    setDurationText(formatSeconds(durationOf(draft.start, draft.stop)));
  }

  const patch = (p: Partial<EntryDraft>) => setDraft((d) => ({ ...d, ...p }));

  /** Reset the whole draft — used when a dialog reopens on a new selection. */
  const reset = (next: EntryDraftInit) => {
    setDraft({
      description: next.description ?? "",
      projectId: next.projectId ?? null,
      taskId: next.taskId ?? null,
      tags: next.tags ?? [],
      billable: next.billable ?? false,
      start: next.start ?? null,
      stop: next.stop ?? null,
    });
    setAnchorDate(next.anchorDate ?? (next.start ? new Date(next.start) : new Date()));
  };

  const setDate = (date: Date) => {
    const iso = toDateInputValue(date);
    if (draft.start) {
      const delta = dateDelta(draft.start, iso);
      patch({
        start: shiftDate(draft.start, delta),
        stop: draft.stop ? shiftDate(draft.stop, delta) : null,
      });
    }
    setAnchorDate(date);
  };

  const commitDuration = () => {
    const parsed = parseTimeInput(durationText);
    if (parsed !== null && parsed >= 0 && draft.start && draft.stop !== null) {
      patch({ stop: new Date(new Date(draft.start).getTime() + parsed * 1000).toISOString() });
    } else {
      setDurationText(formatSeconds(durationOf(draft.start, draft.stop)));
    }
  };

  const durationSeconds = durationOf(draft.start, draft.stop);
  // A create needs a real span; an edit of a running entry legitimately has no stop.
  const hasValidRange = Boolean(draft.start && draft.stop) && durationSeconds > 0;

  /** Noon anchor so Start/Stop have a calendar date before either is picked. */
  const fallbackIso = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    anchorDate.getDate(),
    12
  ).toISOString();

  return {
    draft,
    patch,
    reset,
    anchorDate,
    setDate,
    durationText,
    setDurationText,
    commitDuration,
    durationSeconds,
    hasValidRange,
    fallbackIso,
  };
}
