import type { TimeEntry } from "@timetracker/core/schemas";
import type { TimerState } from "@/lib/idb";

/**
 * The running timer as this browser persists it. Carries everything the bar
 * shows — task, tags and billable included — because an offline reload
 * restores the bar from this alone, and it used to come back without them.
 */
export function timerStateOf(entry: TimeEntry, startedAt: number): TimerState {
  return {
    entryId: entry.id,
    startedAt,
    description: entry.description,
    projectId: entry.projectId,
    projectColor: entry.projectColor,
    taskId: entry.taskId,
    tags: entry.tags,
    billable: entry.billable,
  };
}

/** The running entry as far as this browser knows it, from its persisted snapshot. */
export function entryFromTimerState(saved: TimerState): TimeEntry {
  const iso = new Date(saved.startedAt).toISOString();
  return {
    id: saved.entryId,
    description: saved.description,
    projectId: saved.projectId,
    projectColor: saved.projectColor,
    projectName: null,
    taskId: saved.taskId ?? null,
    taskName: null,
    workspaceId: "",
    start: iso,
    stop: null,
    duration: null,
    billable: saved.billable ?? false,
    tags: saved.tags ?? [],
    syncStatus: null,
    externalId: null,
    syncedAt: null,
    syncError: null,
    calendarEventId: null,
    createdAt: iso,
    updatedAt: iso,
  };
}
