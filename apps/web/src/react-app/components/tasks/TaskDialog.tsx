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
import { dayLabel } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { parseRecurRule } from "@timetracker/core/task-recurrence";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  dateToLocalDate,
  localDateToDate,
  minuteToTimeInput,
  timeInputToMinute,
} from "@/lib/taskUtils";
import type { Task } from "@timetracker/core/schemas";

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
  { value: "weekly", label: "Weekly on…" },
  { value: "monthly", label: "Monthly on the due date" },
];

/** Monday-first, matching the recurring-entry picker. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Stored rule → the option that represents it in the picker. */
function repeatValue(rule: string | null): string {
  if (!rule) return "none";
  return rule.split(":")[0];
}

/** A weekly rule's days, so editing `weekly:1,3` doesn't collapse it to one day. */
function ruleDays(rule: string | null): number[] {
  const parsed = parseRecurRule(rule);
  return parsed?.kind === "weekly" ? parsed.daysOfWeek : [];
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
  const [deadline, setDeadline] = useState<string | null>(task?.deadlineDate ?? null);
  /** `HH:mm` for the time input; empty = no time of day. */
  const [time, setTime] = useState(minuteToTimeInput(task?.scheduledMinute ?? null));
  const [priority, setPriority] = useState(task?.priority ?? 4);
  const [repeat, setRepeat] = useState(repeatValue(task?.recurRule ?? null));
  const [weekDays, setWeekDays] = useState<number[]>(ruleDays(task?.recurRule ?? null));

  // The dialog stays mounted between openings; reseed every time it *opens*.
  // Keying the reseed on the task id alone froze the create form's defaults at
  // first mount: opened from Today it seeded "due today", and stayed due today
  // when opened again from All, where the default is no date at all.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
  }
  if (open && !wasOpen) {
    setName(task?.name ?? "");
    setDescription(task?.description ?? "");
    setProjectId(task?.projectId ?? defaultProjectId);
    setEstimate(formatTimeInput(task?.estimatedSeconds ?? null));
    setDueDate(task?.dueDate ?? defaultDueDate);
    setTime(minuteToTimeInput(task?.scheduledMinute ?? null));
    setDeadline(task?.deadlineDate ?? null);
    setPriority(task?.priority ?? 4);
    setRepeat(repeatValue(task?.recurRule ?? null));
    setWeekDays(ruleDays(task?.recurRule ?? null));
  }

  const reset = () => {
    setName("");
    setDescription("");
    setProjectId(defaultProjectId);
    setEstimate("");
    setDueDate(defaultDueDate);
    setTime("");
    setDeadline(null);
    setPriority(4);
    setRepeat("none");
    setWeekDays([]);
  };

  /** The day a weekly/monthly repeat hangs off: the due date, else today. */
  const anchorDate = () => (dueDate ? localDateToDate(dueDate) : new Date());

  const handleRepeatChange = (value: string) => {
    setRepeat(value);
    // Seed the weekday row with the due day, so switching to weekly shows the
    // schedule it will actually save rather than an empty row.
    if (value === "weekly" && weekDays.length === 0) setWeekDays([anchorDate().getDay()]);
  };

  // Never empty: turning off the last day would save a weekly rule with no
  // days, which the server rejects as unparseable.
  const toggleWeekDay = (d: number) =>
    setWeekDays((cur) =>
      cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d]
    );

  /**
   * "Weekly" saves the days picked in the row (seeded from the due date);
   * "Monthly" is anchored to the due date, falling back to today. A repeat with
   * no anchor has nothing to repeat *on*, and picking one silently (say,
   * Monday) is a schedule the user never agreed to.
   */
  const resolveRepeat = (): string | null => {
    if (repeat === "none") return null;
    if (repeat === "daily" || repeat === "weekdays") return repeat;
    if (repeat === "weekly") {
      const days = weekDays.length ? weekDays : [anchorDate().getDay()];
      return `weekly:${[...days].sort((a, b) => a - b).join(",")}`;
    }
    return `monthly:${anchorDate().getDate()}`;
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
      // A time only means something on a day; with no date it's dropped.
      scheduledMinute: dueDate ? timeInputToMinute(time) : null,
      deadlineDate: deadline,
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
                  value={dueDate ? localDateToDate(dueDate) : null}
                  onSelect={(d) => setDueDate(dateToLocalDate(d))}
                  placeholder="No due date"
                />
              </div>
              {/* A time turns the due date into a block on the calendar, for
                  the estimate's length. Only offered once there's a day for
                  it to sit on. */}
              {dueDate && (
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  aria-label="Time"
                  title="Schedule a time: the task appears on the calendar"
                  className="w-28 shrink-0"
                />
              )}
              {dueDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setDueDate(null);
                    setTime("");
                  }}
                  aria-label="Clear due date"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* When it must be done, as opposed to when it's planned. Kept apart
              from the due date because the two drift: you plan the report for
              Monday because it's owed on Friday. */}
          <div className="space-y-1.5">
            <Label>Deadline</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <DatePicker
                  value={deadline ? localDateToDate(deadline) : null}
                  onSelect={(d) => setDeadline(dateToLocalDate(d))}
                  placeholder="No deadline"
                />
              </div>
              {deadline && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setDeadline(null)}
                  aria-label="Clear deadline"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {!isSubtask && (
            <div className="space-y-1.5">
              <Label>Repeat</Label>
              <Select value={repeat} onValueChange={handleRepeatChange}>
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
              {repeat === "weekly" && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Repeat on">
                  {DAY_ORDER.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={weekDays.includes(d)}
                      aria-label={dayLabel(d, true)}
                      onClick={() => toggleWeekDay(d)}
                      className={cn(
                        "h-8 w-11 rounded-full border text-xs font-medium transition-colors duration-fast ease-out-quart",
                        weekDays.includes(d)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {dayLabel(d)}
                    </button>
                  ))}
                </div>
              )}
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
