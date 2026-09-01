import { useState } from "react";
import {
  Trash2,
  Check,
  Pencil,
  Clock,
  Play,
  Square,
  ChevronRight,
  MoreHorizontal,
  Repeat,
  CalendarDays,
  Flag,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectBadge } from "@/components/ProjectBadge";
import { useUpdateTask, useCompleteTask } from "@/hooks/useTasks";
import { useTimer } from "@/hooks/useTimer";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { formatDurationShort, formatSeconds, parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_RING,
  dateToLocalDate,
  dueTone,
  formatDueDate,
  localDateToDate,
} from "@/lib/taskUtils";
import { describeRecurRule } from "@shared/task-recurrence";
import { cn } from "@/lib/utils";
import type { Task } from "@shared/schemas";

const RECUR_OPTIONS = [
  { value: "", label: "Doesn't repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly on this day" },
  { value: "monthly", label: "Monthly on this date" },
];

const DUE_TONE_CLASS: Record<string, string> = {
  overdue: "text-destructive",
  today: "text-foreground",
  soon: "text-muted-foreground",
  later: "text-muted-foreground",
};

interface TaskRowProps {
  task: Task;
  /** Show the project pill on the row (hidden when the list is grouped by project). */
  showProject?: boolean;
  /** Rendered as a subtask: indented, no project pill, no nesting affordances. */
  nested?: boolean;
  /** Compact single-line form for the Timer rail. */
  dense?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onRequestDelete: (task: Task) => void;
  /** Open the "log time to task" sheet; the list owns the sheet instance. */
  onLogTime: (task: Task) => void;
  onAddSubtask?: (task: Task) => void;
  /**
   * Wired by the list when rows are reorderable; absent means drag is off.
   *
   * Deliberately **cannot carry `className`**: spreading a handler bag that
   * includes one after the row's own `className` prop silently replaces it — an
   * `undefined` in the bag stripped every layout class off the row and collapsed
   * the whole list into a single column. The visual drag state travels as
   * `dragging` instead, and gets merged.
   */
  dragHandlers?: Omit<React.HTMLAttributes<HTMLDivElement>, "className"> & {
    draggable?: boolean;
  };
  dragging?: boolean;
}

// Self-contained task row: done toggle, inline-edit name, click-to-edit estimate
// with a tracked/estimate progress bar, and — the point of the whole surface —
// a one-click start control that turns the task into a running timer.
export function TaskRow({
  task,
  showProject = true,
  nested = false,
  dense = false,
  expanded = false,
  onToggleExpanded,
  onRequestDelete,
  onLogTime,
  onAddSubtask,
  dragHandlers,
  dragging = false,
}: TaskRowProps) {
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const { startTimer, stopTimer } = useTimer();
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const elapsed = useTimerStore((s) => s.elapsed);
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(task.name);
  const [editingTime, setEditingTime] = useState(false);
  const [estimate, setEstimate] = useState("");
  const [dueOpen, setDueOpen] = useState(false);

  const running = runningEntry?.taskId === task.id;

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== task.name) updateTask.mutate({ id: task.id, data: { name: trimmed } });
    else setName(task.name);
    setEditingName(false);
  };

  const startEditTime = () => {
    setEstimate(formatTimeInput(task.estimatedSeconds));
    setEditingTime(true);
  };

  const saveEstimate = () => {
    const trimmed = estimate.trim();
    if (trimmed === "") {
      updateTask.mutate({ id: task.id, data: { estimatedSeconds: null } });
    } else {
      const parsed = parseTimeInput(trimmed);
      if (parsed !== null) updateTask.mutate({ id: task.id, data: { estimatedSeconds: parsed } });
    }
    setEditingTime(false);
  };

  const progress = task.estimatedSeconds
    ? Math.min(100, Math.round((task.trackedSeconds / task.estimatedSeconds) * 100))
    : null;

  const tone = dueTone(task.dueDate);
  const repeats = describeRecurRule(task.recurRule);
  const hasChildren = task.subtaskTotal > 0;

  /**
   * The start control is **persistent**, not revealed on hover.
   *
   * It is the primary action of this entire surface — the fastest path from a
   * plan to tracked time — and a primary action you have to find by hovering is
   * not one. It stays a muted ghost until hover (DESIGN.md's One Accent Rule:
   * the brand red belongs to the running timer and nothing else on the list), and
   * becomes a Stop disc with the running-dot treatment on the one row that is
   * actually running.
   */
  const startControl = running ? (
    <Button
      variant="ghost"
      size={dense ? "icon-xs" : "icon-sm"}
      aria-label={`Stop timer for ${task.name}`}
      title={`Stop — ${formatSeconds(elapsed)}`}
      onClick={stopTimer}
      className="shrink-0 text-primary hover:text-primary"
    >
      <span className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-4 w-4 animate-running-dot rounded-full bg-primary/25" aria-hidden />
        <Square className="relative h-3 w-3 fill-current" />
      </span>
    </Button>
  ) : (
    <Button
      variant="ghost"
      size={dense ? "icon-xs" : "icon-sm"}
      aria-label={`Start timer for ${task.name}`}
      title="Start a timer on this task"
      disabled={!task.active}
      onClick={() =>
        startTimer({
          description: task.name,
          projectId: task.projectId,
          taskId: task.id,
        })
      }
      className="shrink-0 text-muted-foreground hover:text-primary"
    >
      <Play className="h-3.5 w-3.5" />
    </Button>
  );

  const doneToggle = (
    <button
      onClick={() => completeTask(task, task.active)}
      aria-label={task.active ? "Mark task done" : "Mark task not done"}
      aria-pressed={!task.active}
      title={task.priority < 4 ? `Priority: ${PRIORITY_LABEL[task.priority]}` : undefined}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-fast ease-out-quart",
        !task.active
          ? "border-primary bg-primary text-primary-foreground"
          : cn(PRIORITY_RING[task.priority] ?? PRIORITY_RING[4], "hover:border-primary")
      )}
    >
      {!task.active && <Check className="h-2.5 w-2.5" />}
    </button>
  );

  // The rail trades everything that isn't identity or action for width: one
  // line, no estimate bar, no metadata beyond the due tone.
  if (dense) {
    return (
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-fast ease-out-quart hover:bg-muted/50",
          dragging && "opacity-50"
        )}
        {...dragHandlers}
      >
        {doneToggle}
        <span className={cn("min-w-0 flex-1 truncate text-sm", !task.active && "text-muted-foreground line-through")}>
          {task.name}
        </span>
        {task.dueDate && tone === "overdue" && (
          <span className="shrink-0 text-micro text-destructive">Overdue</span>
        )}
        {startControl}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-2 transition-colors duration-fast ease-out-quart hover:bg-muted/50",
        nested && "pl-8",
        running && "bg-primary/5",
        dragging && "opacity-50"
      )}
      {...dragHandlers}
    >
      {doneToggle}

      {/* Disclosure sits between the toggle and the name so the subtask rows
          below line up under the name, not under the checkbox. */}
      {!nested && hasChildren && (
        <button
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide subtasks" : "Show subtasks"}
          className="-ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-fast ease-out-quart",
              expanded && "rotate-90"
            )}
          />
        </button>
      )}

      {/* Name / edit + estimate */}
      <div className="min-w-0 flex-1">
        {editingName ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setName(task.name);
                setEditingName(false);
              }
            }}
            className="h-6 py-0 text-sm"
          />
        ) : (
          <span
            className={`text-sm ${!task.active ? "text-muted-foreground line-through" : ""}`}
          >
            {task.name}
          </span>
        )}

        {editingTime ? (
          <div className="mt-0.5">
            <Input
              autoFocus
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              onBlur={saveEstimate}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEstimate();
                if (e.key === "Escape") setEditingTime(false);
              }}
              placeholder="e.g. 1h 30m"
              title="Estimated time — e.g. 1h 30m, 1:30, 90m"
              className="h-5 w-28 py-0 text-micro"
            />
          </div>
        ) : progress !== null ? (
          <button
            className="mt-0.5 flex w-full max-w-xs items-center gap-1.5 transition-opacity duration-fast ease-out-quart hover:opacity-70"
            onClick={startEditTime}
          >
            <Progress value={progress} className="h-1 flex-1" aria-hidden />
            <span className="text-micro tabular-nums text-muted-foreground">
              {formatDurationShort(task.trackedSeconds)} / {formatDurationShort(task.estimatedSeconds!)}
            </span>
          </button>
        ) : task.trackedSeconds > 0 ? (
          <button
            // gap-1.5, not gap-1: the trailing space in the text node is swallowed
            // at the flex-item boundary, so the dashed underline started hard
            // against the "·" and read tighter than the spaces around it.
            className="mt-0.5 flex items-center gap-1.5 text-micro text-muted-foreground transition-opacity duration-fast ease-out-quart hover:opacity-70"
            onClick={startEditTime}
          >
            <span>{formatDurationShort(task.trackedSeconds)} tracked ·</span>
            <span className="underline decoration-dashed">add estimate</span>
          </button>
        ) : (
          <button
            // `block`: a bare <button> is inline-block, so this ran onto the same
            // line as the task name ("Data mappingadd estimate"). The other two
            // states are flex and already drop below; mt-0.5 shows this meant to.
            className="mt-0.5 block text-micro text-muted-foreground/0 transition-colors duration-fast ease-out-quart group-hover:text-muted-foreground/50 hover:text-muted-foreground!"
            onClick={startEditTime}
          >
            add estimate
          </button>
        )}
      </div>

      {/* ─── Metadata ──────────────────────────────────────────────────────── */}

      {hasChildren && !nested && (
        <span
          className="shrink-0 text-micro tabular-nums text-muted-foreground"
          title={`${task.subtaskDone} of ${task.subtaskTotal} subtasks done`}
        >
          {task.subtaskDone}/{task.subtaskTotal}
        </span>
      )}

      {repeats && (
        <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={repeats} />
      )}

      {/* The due chip is the control, not a label beside one — clicking the date
          is how you change the date. */}
      <Popover open={dueOpen} onOpenChange={setDueOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={task.dueDate ? `Due ${formatDueDate(task.dueDate)} — change` : "Set due date"}
            className={cn(
              "shrink-0 rounded px-1 text-xs transition-colors duration-fast ease-out-quart hover:bg-muted",
              task.dueDate
                ? DUE_TONE_CLASS[tone ?? "later"]
                : "tt-reveal text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            {task.dueDate ? formatDueDate(task.dueDate) : <CalendarDays className="h-3.5 w-3.5" />}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={task.dueDate ? localDateToDate(task.dueDate) : undefined}
            onSelect={(date) => {
              updateTask.mutate({
                id: task.id,
                data: { dueDate: date ? dateToLocalDate(date) : null },
              });
              setDueOpen(false);
            }}
          />
          {task.dueDate && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  updateTask.mutate({ id: task.id, data: { dueDate: null } });
                  setDueOpen(false);
                }}
              >
                Clear due date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {showProject && !nested && task.projectName && (
        <ProjectBadge name={task.projectName} color={task.projectColor} />
      )}

      {/* ─── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-0.5">
        <div className="tt-reveal flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Log time to ${task.name}`}
            title="Log time already spent on this task"
            onClick={() => onLogTime(task)}
          >
            <Clock className="h-3 w-3" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`More actions for ${task.name}`}>
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => {
                  setName(task.name);
                  setEditingName(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Flag className="h-3.5 w-3.5" />
                  Priority
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={String(task.priority)}
                    onValueChange={(v) =>
                      updateTask.mutate({ id: task.id, data: { priority: Number(v) } })
                    }
                  >
                    {PRIORITIES.map((p) => (
                      <DropdownMenuRadioItem key={p} value={String(p)}>
                        {PRIORITY_LABEL[p]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Recurrence belongs to the thing you schedule; a repeating
                  subtask would spawn siblings inside a parent that never
                  repeats, so the server rejects it and the menu doesn't offer it. */}
              {!nested && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Repeat className="h-3.5 w-3.5" />
                    Repeat
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={task.recurRule?.split(":")[0] ?? ""}
                      onValueChange={(v) => {
                        const anchor = task.dueDate ?? dateToLocalDate(new Date());
                        const rule =
                          v === ""
                            ? null
                            : v === "weekly"
                              ? `weekly:${localDateToDate(anchor).getDay()}`
                              : v === "monthly"
                                ? `monthly:${localDateToDate(anchor).getDate()}`
                                : v;
                        updateTask.mutate({ id: task.id, data: { recurRule: rule } });
                      }}
                    >
                      {RECUR_OPTIONS.map((o) => (
                        <DropdownMenuRadioItem key={o.value} value={o.value}>
                          {o.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {!nested && onAddSubtask && (
                <DropdownMenuItem onSelect={() => onAddSubtask(task)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add subtask
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onSelect={() => openTaskLogTime(task.id)}>
                <Clock className="h-3.5 w-3.5" />
                Log time
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onRequestDelete(task)}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {startControl}
      </div>
    </div>
  );
}
