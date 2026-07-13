import type { TimeEntry, CreateTimeEntry } from "@shared/schemas";

export function toCreatePayload(entry: TimeEntry): CreateTimeEntry {
  return {
    description: entry.description,
    projectId: entry.projectId,
    taskId: entry.taskId,
    start: entry.start,
    stop: entry.stop,
    billable: entry.billable,
    tags: entry.tags,
  };
}
