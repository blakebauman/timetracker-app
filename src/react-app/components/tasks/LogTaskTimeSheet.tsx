import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EntryFormSheet } from "@/components/entries/EntryFormSheet";
import { useCreateEntry } from "@/hooks/useEntries";
import { useUpdateTask } from "@/hooks/useTasks";
import { useEntryDraft } from "@/hooks/useEntryDraft";
import { formatDurationShort } from "@/lib/dateUtils";
import type { Task } from "@shared/schemas";

interface LogTaskTimeSheetProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
}

/** Round to the minute so a logged span doesn't carry meaningless seconds. */
const toMinute = (d: Date) => {
  const c = new Date(d);
  c.setSeconds(0, 0);
  return c;
};

/**
 * Turn a task into a time entry.
 *
 * Opens the shared entry form prefilled from the task, so the form itself is the
 * confirmation step — nothing is written until the user submits. An estimate
 * seeds the span (ending now, so it reads as "I just did this"); **without one
 * the times stay blank** rather than inventing a duration, since an unedited
 * guess here becomes a line on an invoice.
 */
export function LogTaskTimeSheet({ task, open, onClose }: LogTaskTimeSheetProps) {
  const createEntry = useCreateEntry();
  const updateTask = useUpdateTask();
  const [markDone, setMarkDone] = useState(false);

  const est = task?.estimatedSeconds ?? null;
  const stopAt = toMinute(new Date());
  const seeded = est
    ? {
        start: new Date(stopAt.getTime() - est * 1000).toISOString(),
        stop: stopAt.toISOString(),
      }
    : {};

  const draft = useEntryDraft({
    description: task?.name ?? "",
    projectId: task?.projectId ?? null,
    taskId: task?.id ?? null,
    ...seeded,
  });

  // The sheet stays mounted between openings; reseed when it opens on a new task.
  const [syncedId, setSyncedId] = useState(task?.id ?? null);
  if (open && task && syncedId !== task.id) {
    setSyncedId(task.id);
    setMarkDone(false);
    draft.reset({
      description: task.name,
      projectId: task.projectId,
      taskId: task.id,
      ...(task.estimatedSeconds
        ? {
            start: new Date(stopAt.getTime() - task.estimatedSeconds * 1000).toISOString(),
            stop: stopAt.toISOString(),
          }
        : {}),
    });
  }

  const handleSubmit = () => {
    const { start, stop } = draft.draft;
    if (!task || !start || !stop || !draft.hasValidRange) return;
    createEntry.mutate(
      { ...draft.draft, start, stop },
      {
        onSuccess: () => {
          if (markDone && task.active) {
            updateTask.mutate({ id: task.id, data: { active: false } });
          }
          onClose();
        },
      }
    );
  };

  return (
    <EntryFormSheet
      open={open && Boolean(task)}
      onClose={onClose}
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
          Prefilled from the {formatDurationShort(est)} estimate. Adjust if the
          work took longer or shorter.
        </p>
      )}
      <div className="flex items-center gap-3">
        <Switch id="mark-task-done" checked={markDone} onCheckedChange={setMarkDone} />
        <Label htmlFor="mark-task-done">Mark task done</Label>
      </div>
    </EntryFormSheet>
  );
}
