import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EntryFormSheet } from "@/components/entries/EntryFormSheet";
import { useCreateEntry } from "@/hooks/useEntries";
import { useAllTasks, useCompleteTask } from "@/hooks/useTasks";
import { useUIStore } from "@/stores/uiStore";
import { useEntryDraft } from "@/hooks/useEntryDraft";
import { formatDurationShort } from "@/lib/dateUtils";
import { localDateToDate } from "@/lib/taskUtils";
import { compareLocalDates, todayLocalDate } from "@shared/task-recurrence";
import type { Task } from "@shared/schemas";

/** Round to the minute so a logged span doesn't carry meaningless seconds. */
const toMinute = (d: Date) => {
  const c = new Date(d);
  c.setSeconds(0, 0);
  return c;
};

/**
 * When the logged span should end.
 *
 * Today's clock time, but **on the task's due date when that date has already
 * passed** — logging a task that was due last Tuesday almost always means work
 * that happened around then, and defaulting to now silently files it in the
 * wrong week, which is the one error a timesheet can't self-correct. The form is
 * still the confirmation step; this only decides what it opens on.
 */
function defaultStop(task: Task): Date {
  const now = toMinute(new Date());
  const today = todayLocalDate();
  if (!task.dueDate || compareLocalDates(task.dueDate, today) >= 0) return now;
  const day = localDateToDate(task.dueDate);
  day.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return day;
}

function seedFor(task: Task) {
  const stopAt = defaultStop(task);
  // Without an estimate the times stay blank rather than inventing a duration:
  // an unedited guess here becomes a line on an invoice.
  return task.estimatedSeconds
    ? {
        start: new Date(stopAt.getTime() - task.estimatedSeconds * 1000).toISOString(),
        stop: stopAt.toISOString(),
      }
    : {};
}

/**
 * Turn a task into a time entry.
 *
 * Opens the shared entry form prefilled from the task, so the form itself is the
 * confirmation step — nothing is written until the user submits.
 *
 * Mounted **once, app-wide** (AppShell) and driven by `uiStore.logTimeTaskId`:
 * the prompt that opens it is a toast, and that toast fires from the Tasks page,
 * the Timer rail and the stop handler alike. Three local copies of this sheet
 * would be three copies of its draft state.
 */
export function LogTaskTimeSheet() {
  const taskId = useUIStore((s) => s.logTimeTaskId);
  const close = useUIStore((s) => s.closeTaskLogTime);
  const { data: tasks = [] } = useAllTasks();
  const task = tasks.find((t) => t.id === taskId) ?? null;

  const createEntry = useCreateEntry();
  const completeTask = useCompleteTask();
  const [markDone, setMarkDone] = useState(false);

  const draft = useEntryDraft({
    description: task?.name ?? "",
    projectId: task?.projectId ?? null,
    taskId: task?.id ?? null,
    ...(task ? seedFor(task) : {}),
  });

  // The sheet stays mounted between openings; reseed when it opens on a new task.
  const [syncedId, setSyncedId] = useState<string | null>(null);
  if (task && syncedId !== task.id) {
    setSyncedId(task.id);
    setMarkDone(false);
    draft.reset({
      description: task.name,
      projectId: task.projectId,
      taskId: task.id,
      ...seedFor(task),
    });
  }

  const est = task?.estimatedSeconds ?? null;

  const handleSubmit = () => {
    const { start, stop } = draft.draft;
    if (!task || !start || !stop || !draft.hasValidRange) return;
    createEntry.mutate(
      { ...draft.draft, start, stop },
      {
        onSuccess: () => {
          if (markDone && task.active) completeTask(task, true);
          close();
        },
      }
    );
  };

  return (
    <EntryFormSheet
      open={Boolean(task)}
      onClose={close}
      title="Log time to task"
      submitLabel="Add entry"
      pending={createEntry.isPending}
      onSubmit={handleSubmit}
      draft={draft}
    >
      {!est && (
        <p className="text-xs text-muted-foreground">
          This task has no estimate, so the times start empty — set when the work
          happened.
        </p>
      )}
      {est && (
        <p className="text-xs text-muted-foreground">
          Prefilled from the {formatDurationShort(est)} estimate
          {task?.dueDate && compareLocalDates(task.dueDate, todayLocalDate()) < 0
            ? ", on the day it was due"
            : ""}
          . Adjust if the work took longer or shorter.
        </p>
      )}
      <div className="flex items-center gap-3">
        <Switch id="mark-task-done" checked={markDone} onCheckedChange={setMarkDone} />
        <Label htmlFor="mark-task-done">Mark task done</Label>
      </div>
    </EntryFormSheet>
  );
}
