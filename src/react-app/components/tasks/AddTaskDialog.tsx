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
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button as UIButton } from "@/components/ui/button";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { useCreateTask } from "@/hooks/useTasks";
import { parseTimeInput } from "@/lib/dateUtils";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  dateToLocalDate,
  localDateToDate,
} from "@/lib/taskUtils";

interface AddTaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-select this project (e.g. when adding within a project group). */
  defaultProjectId?: string | null;
  /** Pre-fill the due date (e.g. when adding into a dated group). */
  defaultDueDate?: string | null;
}

const REPEAT_OPTIONS = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly on the due day" },
  { value: "monthly", label: "Monthly on the due date" },
];

export function AddTaskDialog({
  open,
  onClose,
  defaultProjectId = null,
  defaultDueDate = null,
}: AddTaskDialogProps) {
  const createTask = useCreateTask();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [estimate, setEstimate] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(defaultDueDate);
  const [priority, setPriority] = useState(4);
  const [repeat, setRepeat] = useState("none");

  const reset = () => {
    setName("");
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

  const canSubmit = name.trim().length > 0 && !!projectId && !createTask.isPending;

  const handleSubmit = () => {
    if (!projectId || !name.trim()) return;
    const parsed = estimate.trim() ? parseTimeInput(estimate.trim()) : null;
    createTask.mutate(
      {
        name: name.trim(),
        projectId,
        estimatedSeconds: parsed,
        dueDate,
        priority,
        recurRule: resolveRepeat(),
      },
      { onSuccess: handleClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Tasks belong to a project. Add an optional time estimate to track progress.
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
            <Label>Project</Label>
            <div>
              <ProjectPicker
                value={projectId}
                onChange={setProjectId}
                className="border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-estimate">Estimate (optional)</Label>
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
            <Label>Due date (optional)</Label>
            <div className="flex items-center gap-2">
              <DatePicker
                value={dueDate ? localDateToDate(dueDate) : new Date()}
                onSelect={(d) => setDueDate(dateToLocalDate(d))}
                className={dueDate ? undefined : "text-muted-foreground"}
              />
              {dueDate && (
                <UIButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setDueDate(null)}
                  aria-label="Clear due date"
                >
                  Clear
                </UIButton>
              )}
            </div>
          </div>

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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
