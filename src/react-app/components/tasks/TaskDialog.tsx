import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { useCreateTask, useUpdateTask } from "@/hooks/useTasks";
import { parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  dateToLocalDate,
  localDateToDate,
} from "@/lib/taskUtils";
import type { Task } from "@shared/schemas";

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** Present = edit that task. Absent = create a new one. */
  task?: Task | null;
  /** Create only: pre-select this project (e.g. adding within a project group). */
  defaultProjectId?: string | null;
  /** Create only: pre-fill the due date (e.g. adding into a dated group). */
  defaultDueDate?: string | null;
}

const REPEAT_OPTIONS = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly on the due day" },
  { value: "monthly", label: "Monthly on the due date" },
];

/** Stored rule → the option that represents it in the picker. */
function repeatValue(rule: string | null): string {
  if (!rule) return "none";
  return rule.split(":")[0];
}

/**
 * One dialog for creating **and** editing a task.
 *
 * Two forms over the same eight fields drift the moment one of them gains a
 * ninth — which is exactly how "notes" would have ended up creatable but not
 * editable. The row keeps its fast paths (click the name to rename, click the
 * due chip to re-date); this is where everything else lives.
 */
export function TaskDialog({
  open,
  onClose,
  task = null,
  defaultProjectId = null,
  defaultDueDate = null,
}: TaskDialogProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const editing = Boolean(task);

  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [projectId, setProjectId] = useState<string | null>(task?.projectId ?? defaultProjectId);
  const [estimate, setEstimate] = useState(formatTimeInput(task?.estimatedSeconds ?? null));
  const [dueDate, setDueDate] = useState<string | null>(task?.dueDate ?? defaultDueDate);
  const [priority, setPriority] = useState(task?.priority ?? 4);
  const [repeat, setRepeat] = useState(repeatValue(task?.recurRule ?? null));

  // The dialog stays mounted between openings; reseed when it opens on another
  // task (or switches between create and edit).
  const [syncedId, setSyncedId] = useState<string | null>(task?.id ?? null);
  if (open && (task?.id ?? null) !== syncedId) {
    setSyncedId(task?.id ?? null);
    setName(task?.name ?? "");
    setDescription(task?.description ?? "");
    setProjectId(task?.projectId ?? defaultProjectId);
    setEstimate(formatTimeInput(task?.estimatedSeconds ?? null));
    setDueDate(task?.dueDate ?? defaultDueDate);
    setPriority(task?.priority ?? 4);
    setRepeat(repeatValue(task?.recurRule ?? null));
  }

  const reset = () => {
    setSyncedId(null);
    setName("");
    setDescription("");
    setProjectId(defaultProjectId);
    setEstimate("");
    setDueDate(defaultDueDate);
    setPriority(4);
    setRepeat("none");
  };

  /**
   * "Weekly"/"Monthly" are anchored to the due date, falling back to today.
   * A weekly repeat with no anchor has nothing to repeat *on*, and picking one
   * silently (say, Monday) is a schedule the user never agreed to.
   */
  const resolveRepeat = (): string | null => {
    if (repeat === "none") return null;
    if (repeat === "daily" || repeat === "weekdays") return repeat;
    const anchor = dueDate ? localDateToDate(dueDate) : new Date();
    return repeat === "weekly" ? `weekly:${anchor.getDay()}` : `monthly:${anchor.getDate()}`;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pending = createTask.isPending || updateTask.isPending;
  const canSubmit = name.trim().length > 0 && !!projectId && !pending;

  const handleSubmit = () => {
    if (!projectId || !name.trim()) return;
    const parsed = estimate.trim() ? parseTimeInput(estimate.trim()) : null;
    const fields = {
      name: name.trim(),
      // Empty means *no* notes, not an empty string — the row decides whether to
      // render a second line on null, and "" would give it a blank one.
      description: description.trim() || null,
      estimatedSeconds: parsed,
      dueDate,
      priority,
      recurRule: resolveRepeat(),
    };

    if (task) {
      updateTask.mutate({ id: task.id, data: fields }, { onSuccess: handleClose });
    } else {
      createTask.mutate({ ...fields, projectId }, { onSuccess: handleClose });
    }
  };

  // A subtask belongs to its parent's project and can't repeat on its own — the
  // server enforces both, so the form must not offer either.
  const isSubtask = Boolean(task?.parentId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Notes stay with the task — they're never copied onto a time entry."
              : "Tasks belong to a project. Everything else is optional."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-name">Name</Label>
            <Input
              id="task-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
              placeholder="What needs doing?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              // No Enter-to-submit here: this is the one field where a newline is
              // the expected result of pressing Return.
              placeholder="Context, links, acceptance criteria — anything that isn't the name."
              rows={3}
              className="resize-y"
            />
          </div>

          {!isSubtask && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <div>
                <ProjectPicker value={projectId} onChange={setProjectId} className="border" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-estimate">Estimate</Label>
              <Input
                id="task-estimate"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
                placeholder="e.g. 1h 30m"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v))}>
                <SelectTrigger className="w-full" aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={String(p)}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Due date</Label>
            <div className="flex items-center gap-2">
              {/* min-w-0 flex-1, not a bare sibling: DatePicker's trigger is
                  `w-full`, so beside a flex sibling it claims the whole row and
                  pushes Clear off the edge of the dialog. */}
              <div className="min-w-0 flex-1">
                <DatePicker
                  value={dueDate ? localDateToDate(dueDate) : new Date()}
                  onSelect={(d) => setDueDate(dateToLocalDate(d))}
                  className={dueDate ? undefined : "text-muted-foreground"}
                />
              </div>
              {dueDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setDueDate(null)}
                  aria-label="Clear due date"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {!isSubtask && (
            <div className="space-y-1.5">
              <Label>Repeat</Label>
              <Select value={repeat} onValueChange={setRepeat}>
                <SelectTrigger className="w-full" aria-label="Repeat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPEAT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Completing an occurrence is what creates the next one — say so,
                  or a repeat that hasn't visibly done anything reads as broken. */}
              {repeat !== "none" && (
                <p className="text-micro text-muted-foreground">
                  The next occurrence is created when you tick this one off.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {editing ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
