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
  Circle,
  CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SpentFigure } from "@/components/ui/spent-figure";
import { LazyCalendar } from "@/components/ui/lazy-calendar";
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
import { ColorDot } from "@/components/ColorDot";
import { useUpdateTask, useCompleteTask } from "@/hooks/useTasks";
import { TASK_ROW_ATTR } from "@/hooks/useTaskListKeys";
import { useTimer } from "@/hooks/useTimer";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { formatDurationShort, formatSeconds } from "@/lib/dateUtils";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_FLAG,
  dateToLocalDate,
  dueTone,
  formatDueDate,
  formatMinute,
  localDateToDate,
} from "@/lib/taskUtils";
import { daysBetweenLocal, todayLocalDate } from "@timetracker/core/task-recurrence";
import { cn } from "@/lib/utils";
import type { Task } from "@timetracker/core/schemas";

const RECUR_OPTIONS = [
  { value: "", label: "Doesn't repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly on this day" },
  { value: "monthly", label: "Monthly on this date" },
];

/** How close a deadline has to be before the row mentions it at all. */
const DEADLINE_RISK_DAYS = 2;

/** "Deadline passed" / "Deadline today" / "Deadline tomorrow" / "Deadline Friday". */
function deadlinePhrase(deadlineDate: string, days: number) {
  if (days < 0) return "Deadline passed";
  const day = formatDueDate(deadlineDate);
  return `Deadline ${days <= 1 ? day.toLowerCase() : day}`;
}

const DUE_TONE_CLASS: Record<string, string> = {
  overdue: "text-destructive",
  today: "text-foreground",
  soon: "text-muted-foreground",
  later: "text-muted-foreground",
};

/**
 * The house focus treatment for the row's bare `<button>`s. `Button` carries it
 * already; the done toggle, disclosure, rename, estimate and due controls are
 * plain elements and were falling back to the browser's 1px outline — the one
 * thin ring DESIGN.md's Focus Hue Rule rules out.
 */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface TaskRowProps {
  task: Task;
  /** Show the project pill on the row (hidden when the list is grouped by project). */
  showProject?: boolean;
  /** Rendered as a subtask: indented, no project pill, no nesting affordances. */
  nested?: boolean;
  /** Compact single-line form for the Timer's plan column. */
  dense?: boolean;
  /**
   * A second line under a dense row, inside its hover and drag area — the plan
   * column's project, spent-vs-estimate and plan state. Ignored when not dense.
   */
  denseMeta?: React.ReactNode;
  /** A dense row's extra control, before its start button (the plan column's move). */
  denseAction?: React.ReactNode;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onRequestDelete: (task: Task) => void;
  /** Open the full task form (notes, estimate, due date, priority, repeat). */
  onEdit?: (task: Task) => void;
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
  denseMeta,
  denseAction,
  expanded = false,
  onToggleExpanded,
  onRequestDelete,
  onEdit,
  onLogTime,
  onAddSubtask,
  dragHandlers,
  dragging = false,
}: TaskRowProps) {
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const { startTimer, stopTimer } = useTimer();
  const runningEntry = useTimerStore((s) => s.runningEntry);
  // Only the running task's row ticks; the rest read a constant 0.
  const elapsed = useTimerStore((s) => (s.runningEntry?.taskId === task.id ? s.elapsed : 0));
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);

  const [dueOpen, setDueOpen] = useState(false);

  const running = runningEntry?.taskId === task.id;

  const tone = dueTone(task.dueDate);
  // Overdue in words, not only in red: "2 days late" reads the same to a
  // screen reader and to anyone who can't tell the red from the ink.
  const lateDays =
    tone === "overdue" && task.dueDate ? -daysBetweenLocal(todayLocalDate(), task.dueDate) : 0;
  const lateLabel = lateDays === 1 ? "1 day late" : lateDays > 1 ? `${lateDays} days late` : null;
  const timeFormat = useUIStore((s) => s.timeFormat);
  // "Friday" or "Friday 14:00" — a scheduled time rides on the day chip.
  const dueLabel = task.dueDate
    ? `${formatDueDate(task.dueDate)}${
        task.scheduledMinute !== null ? ` ${formatMinute(task.scheduledMinute, timeFormat)}` : ""
      }`
    : null;
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
  const startControl = !task.active ? null : running ? (
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

  /**
   * Ticking off is the verb this list is for, and it was the smallest target on
   * the row: a 16px box beside a 32px start button. The box stays 16px; the
   * button around it is 32px (44px on a coarse pointer), pulled back with a
   * negative margin so the row's layout doesn't move. A checkbox, announced as
   * one, named by the task — priority is the flag's to announce, not this.
   */
  const doneToggle = (
    <button
      type="button"
      role="checkbox"
      aria-checked={!task.active}
      onClick={() => completeTask(task, task.active)}
      aria-label={`Done: ${task.name}`}
      title={task.active ? "Mark done" : "Mark not done"}
      className={cn(
        "group/check -m-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full pointer-coarse:-m-3.5 pointer-coarse:h-11 pointer-coarse:w-11",
        FOCUS_RING
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded border transition-colors duration-fast ease-out-quart",
          // Ink, not the brand red: ticking a task off is the end of it, not an
          // event to signal. Priority is a flag beside the name, so the box is
          // the same quiet edge on every row.
          !task.active
            ? "border-muted-foreground bg-muted-foreground text-background"
            : "border-muted-foreground/50 group-hover/check:border-foreground"
        )}
      >
        {!task.active && <Check className="h-2.5 w-2.5" />}
      </span>
    </button>
  );

  // The rail trades everything that isn't identity or action for width: one
  // line, no estimate bar, no metadata beyond the due tone.
  if (dense) {
    return (
      <div
        className={cn(
          "group rounded-md px-2 py-1.5 transition-colors duration-fast ease-out-quart hover:bg-muted/40",
          dragging && "opacity-50"
        )}
        {...dragHandlers}
      >
        <div className="flex items-center gap-2">
          {doneToggle}
          <span className={cn("min-w-0 flex-1 truncate text-sm", !task.active && "text-muted-foreground line-through")}>
            {task.name}
          </span>
          {task.scheduledMinute !== null && tone !== "overdue" && (
            <span className="shrink-0 font-mono text-micro tabular-nums text-muted-foreground">
              {formatMinute(task.scheduledMinute, timeFormat)}
            </span>
          )}
          {/* No "Overdue" chip: the plan column files a late task under its
              Overdue heading, and the chip under it said the same word twice. */}
          {denseAction}
          {startControl}
        </div>
        {/* Indented to the name, past the done toggle (16px + the 8px gap). */}
        {denseMeta && <div className="mt-0.5 pl-6">{denseMeta}</div>}
      </div>
    );
  }

  // A subtask is due when its parent is: the dated views select on the parent's
  // date and re-attach children, so a date set on a subtask is never read. The
  // row doesn't offer to set one; an existing date still shows so nothing is
  // hidden from the user who set it through the form. A finished task has no
  // due date left to keep: "Yesterday" in overdue red on a ticked row was an
  // alarm about work that was already done.
  const showDue = task.active && (Boolean(task.dueDate) || !nested);
  const showProjectDot = showProject && !nested && Boolean(task.projectName);
  // Only a deadline that is close or gone earns a place on the row; a distant
  // one is a fact about the plan, and the dialog keeps it.
  const deadlineDays =
    task.deadlineDate && task.active && !nested
      ? daysBetweenLocal(todayLocalDate(), task.deadlineDate)
      : null;
  // One alarm per row: once the due date itself has passed, "late" already
  // says the task needs doing now, and a deadline line under it was a second
  // and third red mark about the same fact.
  const deadlineAtRisk =
    deadlineDays !== null && deadlineDays <= DEADLINE_RISK_DAYS && !lateLabel;
  const tracked = task.trackedSeconds + elapsed;
  // A finished task keeps its figure: in History it's the record of what the
  // work cost against what was planned.
  const showTracking = tracked > 0 || running;
  const overBy =
    task.estimatedSeconds && tracked > task.estimatedSeconds ? tracked - task.estimatedSeconds : 0;
  const flagged = task.active && task.priority <= 2;

  // The resting row is a to-do: done toggle, name, due day, start. Everything
  // else the task carries — notes, tags, repeat, estimate, a distant deadline —
  // lives in the dialog the name opens. The line under the name appears only
  // when there is something to say *now*: time is being spent against it, or
  // its deadline is close. An empty "0m / 2h" bar on every row said nothing and
  // said it on every row.
  return (
    <div className="@container">
    <div
      // The list's keyboard cursor (useTaskListKeys): focusable by script, not
      // by Tab — Tab still walks the controls inside, as it always did.
      {...{ [TASK_ROW_ATTR]: task.id }}
      tabIndex={-1}
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 transition-colors duration-fast ease-out-quart hover:bg-muted/40",
        // Inset: the card clips its rows to its corners, so an outer ring is cut off.
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
        nested && "pl-9",
        running && "bg-primary/5",
        dragging && "opacity-50",
        dragHandlers?.draggable && "cursor-grab active:cursor-grabbing"
      )}
      {...dragHandlers}
    >
      {doneToggle}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {onEdit ? (
            // The name opens the task, the way a to-do list does. It used to
            // rename in place, which left the details two steps away behind ⋯
            // and turned a click meant to look into a click that edits.
            <button
              type="button"
              title="Open task"
              onClick={() => onEdit(task)}
              // Two lines before it truncates: on a phone the controls take
              // half the row, and one line left "Draft cutove…".
              aria-haspopup="dialog"
              className={cn(
                "min-w-0 line-clamp-2 rounded-sm text-left text-sm break-words",
                FOCUS_RING,
                !task.active && "text-muted-foreground"
              )}
            >
              {task.name}
            </button>
          ) : (
            <span
              className={cn("min-w-0 line-clamp-2 text-sm break-words", !task.active && "text-muted-foreground")}
            >
              {task.name}
            </span>
          )}

          {flagged && (
            <Flag
              className={cn("h-3 w-3 shrink-0 fill-current", PRIORITY_FLAG[task.priority])}
              role="img"
              aria-label={`${PRIORITY_LABEL[task.priority]} priority`}
            />
          )}

          {/* One control for the checklist: how far along it is, and the way
              to open it. Collapsed by default — a card is one task until you
              ask to see its parts. */}
          {!nested && hasChildren && (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Hide" : "Show"} subtasks, ${task.subtaskDone} of ${task.subtaskTotal} done`}
              className={cn(
                "flex shrink-0 items-center gap-0.5 rounded-full px-1 text-xs tabular-nums text-muted-foreground transition-colors duration-fast ease-out-quart hover:bg-muted hover:text-foreground",
                FOCUS_RING
              )}
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform duration-fast ease-out-quart",
                  expanded && "rotate-90"
                )}
                aria-hidden
              />
              {task.subtaskDone}/{task.subtaskTotal}
            </button>
          )}
        </div>

        {(showTracking || deadlineAtRisk) && (
          // Wraps rather than squeezes: in a narrow board column the deadline
          // drops under the bar instead of breaking "1h 30m / 2h" in half.
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            {showTracking &&
              (task.estimatedSeconds ? (
                <span
                  className="flex min-w-0 items-center gap-1.5"
                  title={`${formatDurationShort(tracked)} of a ${formatDurationShort(task.estimatedSeconds)} estimate`}
                >
                  {/* Fixed width, so the bars line up down the list whatever the
                      figure beside them says — until a narrow card needs the
                      room, when the bar gives way before the figure does. */}
                  <Progress
                    value={Math.min(100, Math.round((tracked / task.estimatedSeconds) * 100))}
                    className={cn(
                      "h-1 w-20 min-w-4 shrink",
                      // Past the estimate the fill is no longer "progress".
                      overBy > 0 && "[&>[data-slot=progress-indicator]]:bg-warning"
                    )}
                    aria-hidden
                  />
                  <SpentFigure
                    spent={formatDurationShort(tracked)}
                    of={formatDurationShort(task.estimatedSeconds)}
                    className="shrink-0 whitespace-nowrap"
                  />
                </span>
              ) : (
                <span className="whitespace-nowrap font-mono text-micro tabular-nums text-muted-foreground">
                  {formatDurationShort(tracked)} tracked
                </span>
              ))}
            {overBy > 0 && (
              <span className="shrink-0 whitespace-nowrap text-xs text-warning-ink">
                Over estimate by {formatDurationShort(overBy)}
              </span>
            )}
            {deadlineAtRisk && (
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap text-xs",
                  deadlineDays! < 0 ? "text-destructive" : "text-warning-ink"
                )}
              >
                {deadlinePhrase(task.deadlineDate!, deadlineDays!)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* The due chip is the control, not a label beside one — clicking the date
          is how you change the date. */}
      {showDue && (
        <Popover open={dueOpen} onOpenChange={setDueOpen}>
          <PopoverTrigger asChild>
            <button
              title={lateLabel && dueLabel ? `Due ${dueLabel}` : undefined}
              aria-label={
                dueLabel
                  ? `Due ${dueLabel}${lateLabel ? `, ${lateLabel}` : ""} — change`
                  : "Set due date"
              }
              className={cn(
                "shrink-0 rounded-full px-1.5 text-xs transition-colors duration-fast ease-out-quart hover:bg-muted",
                FOCUS_RING,
                task.dueDate
                  ? DUE_TONE_CLASS[tone ?? "later"]
                  : "tt-reveal text-muted-foreground hover:text-foreground"
              )}
            >
              {/* A late task's chip says how late, which is the news; the date
                  itself is in the tooltip and the accessible name. */}
              {lateLabel ?? dueLabel ?? <CalendarDays className="h-3.5 w-3.5" />}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <LazyCalendar
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
      )}

      {/* Where the list isn't already grouped by project (Board, other
          groupings), the swatch says which client it is; the name is a hover
          away. A full pill per card cost the title its width. */}
      {showProjectDot && (
        <span
          role="img"
          aria-label={`Project: ${task.projectName}`}
          title={task.projectName!}
          className="flex shrink-0 items-center"
        >
          <ColorDot color={task.projectColor} className="h-2 w-2" />
        </span>
      )}

      {/* ─── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-0.5">
        <div className="tt-reveal flex items-center gap-0.5">
          {/* Hidden on a phone: the menu carries "Log time" too, and on a touch
              device (where the reveal is always on) the extra 24px came straight
              out of the name. */}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Log time to ${task.name}`}
            title="Log time already spent on this task"
            onClick={() => onLogTime(task)}
            className="hidden @xl:inline-flex"
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
              {onEdit && (
                <DropdownMenuItem onSelect={() => onEdit(task)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit task…
                </DropdownMenuItem>
              )}

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

              {/* The board's drag, for keyboards and touch screens — HTML drag
                  and drop is neither. A subtask has no card of its own. */}
              {!nested && task.active && (
                <DropdownMenuItem
                  onSelect={() =>
                    updateTask.mutate({ id: task.id, data: { inProgress: !task.startedAt } })
                  }
                >
                  {task.startedAt ? (
                    <Circle className="h-3.5 w-3.5" />
                  ) : (
                    <CircleDot className="h-3.5 w-3.5" />
                  )}
                  {task.startedAt ? "Move back to To do" : "Mark in progress"}
                </DropdownMenuItem>
              )}

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
    </div>
  );
}
