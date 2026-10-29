import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ListChecks, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { DayOffPortion, Task } from "@timetracker/core/schemas";
import { addLocalDays, compareLocalDates } from "@timetracker/core/task-recurrence";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LazyCalendar } from "@/components/ui/lazy-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SpentFigure } from "@/components/ui/spent-figure";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ColorDot } from "@/components/ColorDot";
import { TaskRow } from "./TaskRow";
import { QuickAddTask } from "./QuickAddTask";
import { PlanMyDay } from "./PlanMyDay";
import { useAllTasks, useUpdateTask } from "@/hooks/useTasks";
import { usePlanFlags } from "@/hooks/usePlanFlags";
import { useDayRollover } from "@/hooks/useDayRollover";
import { useDaysOffMap } from "@/hooks/useDaysOff";
import { useUIStore } from "@/stores/uiStore";
import {
  comparePlanned,
  dateToLocalDate,
  formatDueHeading,
  formatMinute,
  localDateToDate,
} from "@/lib/taskUtils";
import { formatDurationShort } from "@/lib/dateUtils";
import type { PlanFlag } from "@/lib/planState";
import { cn } from "@/lib/utils";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A day heading inside the week ahead: "Friday 23 Oct". The Tasks page's
 * "Friday · Fri 23 Oct" form pairs a relative word with the date, which within
 * one week is the weekday twice; only "Tomorrow" earns the pair.
 */
function dayHeading(day: string, today: string): string {
  if (day === addLocalDays(today, 1)) return formatDueHeading(day, today);
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAY[new Date(y, m - 1, d).getDay()]} ${d} ${MONTH[m - 1]}`;
}

/** How far ahead "Upcoming" looks. A week: past that, it's the Tasks page's job. */
const UPCOMING_DAYS = 7;
/** Overdue folds behind a count past this, so a backlog can't bury today. */
const OVERDUE_VISIBLE = 5;

interface PlanSections {
  overdue: Task[];
  today: Task[];
  upcoming: { day: string; tasks: Task[] }[];
  /** Estimate still to do across overdue + today, in seconds. */
  remaining: number;
}

/**
 * Today's plan, sorted into what's late, what's today and what's coming.
 *
 * Today puts scheduled tasks first, in time order — they are the day's fixed
 * points — then the rest in plan order. Subtasks are left out: they ride
 * under their parent on the Tasks page, and a row with no parent beside it
 * reads as a stray.
 */
function usePlanSections(tasks: Task[], today: string): PlanSections {
  return useMemo(() => {
    const open = tasks.filter((t) => t.active && !t.parentId && t.dueDate);
    const overdue = open
      .filter((t) => compareLocalDates(t.dueDate!, today) < 0)
      .sort(comparePlanned);
    const todays = open
      .filter((t) => t.dueDate === today)
      .sort((a, b) => {
        if (a.scheduledMinute !== null && b.scheduledMinute !== null)
          return a.scheduledMinute - b.scheduledMinute;
        if (a.scheduledMinute !== null) return -1;
        if (b.scheduledMinute !== null) return 1;
        return comparePlanned(a, b);
      });
    const horizon = addLocalDays(today, UPCOMING_DAYS);
    const byDay = new Map<string, Task[]>();
    for (const t of open
      .filter(
        (t) => compareLocalDates(t.dueDate!, today) > 0 && compareLocalDates(t.dueDate!, horizon) <= 0
      )
      .sort(comparePlanned)) {
      const list = byDay.get(t.dueDate!);
      if (list) list.push(t);
      else byDay.set(t.dueDate!, [t]);
    }
    let remaining = 0;
    for (const t of [...overdue, ...todays]) {
      if (t.estimatedSeconds) remaining += Math.max(0, t.estimatedSeconds - t.trackedSeconds);
    }
    return {
      overdue,
      today: todays,
      // Every day of the week, empty ones too: the week reads as a week, and
      // an empty day is still somewhere to move a task to.
      upcoming: Array.from({ length: UPCOMING_DAYS }, (_, i) => {
        const day = addLocalDays(today, i + 1);
        return { day, tasks: byDay.get(day) ?? [] };
      }),
      remaining,
    };
  }, [tasks, today]);
}

/**
 * Register the list's rows with FullCalendar's `Draggable`, only while a grid
 * is on screen to drop onto. Imported on demand: the column also stands beside
 * the list view, which is the landing view, and must not pull FullCalendar into
 * it. `create: false` — the drop handler in CalendarBody writes the real entry
 * or schedule; letting FullCalendar mint a placeholder left a ghost behind.
 */
function useCalendarDraggable(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    let draggable: { destroy: () => void } | null = null;
    let cancelled = false;
    void import("@fullcalendar/react/interaction").then(({ Draggable }) => {
      if (cancelled || !ref.current) return;
      draggable = new Draggable(ref.current, {
        itemSelector: "[data-task-drag]",
        eventData: () => ({ create: false }),
      });
    });
    return () => {
      cancelled = true;
      draggable?.destroy();
    };
  }, [ref, enabled]);
}

/** Where a move landed, in the column's own words. */
function moveLabel(day: string | null, today: string): string {
  if (day === null) return "no date";
  if (day === today) return "today";
  if (day === addLocalDays(today, 1)) return "tomorrow";
  return compareLocalDates(day, today) > 0 &&
    compareLocalDates(day, addLocalDays(today, UPCOMING_DAYS)) <= 0
    ? dayHeading(day, today)
    : formatDueHeading(day, today);
}

/**
 * Move a task to another day, with one Undo. The time of day rides along (a
 * 10:00 block moved to Friday is 10:00 on Friday) unless the date is cleared,
 * which clears the time server-side; Undo puts both back.
 */
function useMoveTask(today: string) {
  const updateTask = useUpdateTask();
  return (task: Task, day: string | null) => {
    if (day === task.dueDate) return;
    const prev = { dueDate: task.dueDate, scheduledMinute: task.scheduledMinute };
    updateTask.mutate(
      { id: task.id, data: { dueDate: day } },
      {
        onSuccess: () =>
          toast.success(`Moved “${task.name}” to ${moveLabel(day, today)}`, {
            action: {
              label: "Undo",
              onClick: () => updateTask.mutate({ id: task.id, data: prev }),
            },
          }),
      }
    );
  };
}

/**
 * The keyboard and touch path to another day — a drag is neither. The days
 * offered are the column's own (today and the week ahead), so the choice reads
 * as "which heading should this sit under"; a date further out is one more
 * step, through the same calendar the Tasks page's due chip opens.
 */
function MoveDayButton({
  task,
  today,
  onMove,
}: {
  task: Task;
  today: string;
  onMove: (task: Task, day: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const days = Array.from({ length: UPCOMING_DAYS + 1 }, (_, i) => addLocalDays(today, i));
  const move = (day: string | null) => {
    setOpen(false);
    onMove(task, day);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPicking(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="tt-reveal shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Move “${task.name}” to another day`}
          title="Move to another day"
        >
          <CalendarDays className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("p-1", picking ? "w-auto" : "w-56")}>
        {picking ? (
          <>
            <Button
              variant="ghost"
              size="xs"
              className="gap-1 text-muted-foreground"
              onClick={() => setPicking(false)}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Back
            </Button>
            <LazyCalendar
              mode="single"
              selected={task.dueDate ? localDateToDate(task.dueDate) : undefined}
              onSelect={(date) => date && move(dateToLocalDate(date))}
            />
          </>
        ) : (
          <div role="group" aria-label={`Move “${task.name}” to`} className="flex flex-col">
            {days.map((day) => {
              const current = day === task.dueDate;
              return (
                <Button
                  key={day}
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal"
                  disabled={current}
                  aria-current={current || undefined}
                  onClick={() => move(day)}
                >
                  {day === today ? "Today" : dayHeading(day, today)}
                  {current && <span className="ml-auto text-xs text-muted-foreground">Now</span>}
                </Button>
              );
            })}
            <div className="my-1 h-px bg-border" aria-hidden />
            <Button variant="ghost" size="sm" className="justify-start font-normal" onClick={() => setPicking(true)}>
              Pick a date…
            </Button>
            <Button variant="ghost" size="sm" className="justify-start font-normal" onClick={() => move(null)}>
              No date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FlagLine({ flag }: { flag: PlanFlag }) {
  const timeFormat = useUIStore((s) => s.timeFormat);
  const dismiss = useUIStore((s) => s.dismissPlanFlag);
  const minute = (d: Date) => formatMinute(d.getHours() * 60 + d.getMinutes(), timeFormat);
  const text =
    flag.kind === "missed"
      ? `Not started — planned ${minute(flag.start)}–${minute(flag.end)}`
      : `Over estimate by ${formatDurationShort(flag.overSeconds)}`;
  return (
    <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-warning-ink">
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="-my-1 text-muted-foreground hover:text-foreground"
        aria-label={`Dismiss: ${text}`}
        title="Dismiss"
        onClick={() => dismiss(flag.key)}
      >
        <X className="h-3 w-3" />
      </Button>
    </span>
  );
}

interface PlanRowProps {
  task: Task;
  flag?: PlanFlag;
  /** Rows register with the grid's drag (calendar view): onto a slot. */
  draggable: boolean;
  /** Rows drag between the column's days (everywhere else). */
  dayDrag?: { dragging: boolean; onStart: () => void; onEnd: () => void };
  move: React.ReactNode;
}

function PlanRow({ task, flag, draggable, dayDrag, move }: PlanRowProps) {
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);
  const meta = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-micro text-muted-foreground">
        <ColorDot color={task.projectColor} className="h-1.5 w-1.5" />
        <span className="min-w-0 flex-1 truncate">{task.projectName}</span>
        {/* Same rule as the Tasks list: "0m / 45m" on every row before anything
            is tracked says nothing, on every row. The figure appears once time
            is spent against it. */}
        {task.estimatedSeconds && task.trackedSeconds > 0 ? (
          <SpentFigure
            spent={formatDurationShort(task.trackedSeconds)}
            of={formatDurationShort(task.estimatedSeconds)}
          />
        ) : task.trackedSeconds > 0 ? (
          <span className="font-mono tabular-nums text-foreground">
            {formatDurationShort(task.trackedSeconds)}
          </span>
        ) : null}
      </span>
      {flag && <FlagLine flag={flag} />}
    </>
  );
  return (
    <div
      {...(draggable ? { "data-task-drag": true } : {})}
      data-task-id={task.id}
      data-project-id={task.projectId}
      data-task-name={task.name}
      data-estimate={task.estimatedSeconds ?? ""}
      title={
        draggable
          ? "Drag onto the grid: a slot ahead of now schedules it, one behind now logs the time"
          : dayDrag
            ? "Drag onto another day to move it"
            : undefined
      }
    >
      <TaskRow
        task={task}
        dense
        denseMeta={meta}
        denseAction={move}
        dragging={dayDrag?.dragging}
        dragHandlers={
          dayDrag
            ? {
                draggable: true,
                onDragStart: (e: React.DragEvent) => {
                  e.dataTransfer.effectAllowed = "move";
                  // Firefox starts no drag without data.
                  e.dataTransfer.setData("text/plain", task.name);
                  dayDrag.onStart();
                },
                onDragEnd: dayDrag.onEnd,
              }
            : undefined
        }
        onRequestDelete={() => {}}
        onLogTime={(t) => openTaskLogTime(t.id)}
      />
    </div>
  );
}

const OFF_LABEL: Record<DayOffPortion, string> = {
  full: "Day off",
  am: "Morning off",
  pm: "Afternoon off",
};

function SectionHeading({
  children,
  figure,
  tone,
  empty,
  off,
}: {
  children: React.ReactNode;
  figure?: React.ReactNode;
  tone?: "late";
  /** An empty day: the heading carries "Nothing due" instead of rows. */
  empty?: boolean;
  /** Booked time off on this day (Settings → Time off). */
  off?: DayOffPortion;
}) {
  return (
    <h3
      className={cn(
        "flex items-baseline gap-2 px-2 pt-3 pb-1 text-xs font-medium",
        // Lateness is destructive ink everywhere tasks are listed (TaskRow's
        // chip, the Today tab's count); the warning hue is the plan flags'.
        tone === "late" ? "text-destructive" : "text-muted-foreground"
      )}
    >
      <span>{children}</span>
      {figure !== undefined && <span className="font-mono tabular-nums">{figure}</span>}
      {off ? (
        <span className="font-normal">{OFF_LABEL[off]}</span>
      ) : (
        empty && <span className="font-normal">Nothing due</span>
      )}
    </h3>
  );
}

/**
 * The plan, as a body shared by the standing column and the narrow-width sheet.
 */
function PlanBody({ draggable }: { draggable: boolean }) {
  const today = useDayRollover();
  const { data: tasks = [], isPending, isError } = useAllTasks();
  const flags = usePlanFlags(tasks);
  const sections = usePlanSections(tasks, today);
  const daysOff = useDaysOffMap();
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useCalendarDraggable(listRef, draggable && !isPending);
  const moveTask = useMoveTask(today);
  // Beside the grid a row drags onto a slot (FullCalendar's pointer drag, which
  // the native one would fight); everywhere else it drags between days.
  const daysDrop = !draggable;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const endDrag = () => {
    setDragId(null);
    setOverDay(null);
  };
  /** A day section's drop props; inert unless a row of this column is mid-drag. */
  const dropOn = (day: string) =>
    daysDrop && dragId
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (overDay !== day) setOverDay(day);
          },
          onDragLeave: (e: React.DragEvent) => {
            // Leaving for a child row isn't leaving the day.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setOverDay((cur) => (cur === day ? null : cur));
            }
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const task = tasks.find((t) => t.id === dragId);
            endDrag();
            if (task) moveTask(task, day);
          },
        }
      : {};
  // A wash, not an outline: the list clips to the card, and an outline would
  // be cut at its edges. Takes no layout space, so nothing reflows mid-drag.
  const dropWash = (day: string) =>
    cn(
      "rounded-md transition-colors duration-fast ease-out-quart",
      overDay === day && "bg-muted"
    );

  const overdueShown = showAllOverdue ? sections.overdue : sections.overdue.slice(0, OVERDUE_VISIBLE);
  const hidden = sections.overdue.length - overdueShown.length;
  const nothingToday = sections.overdue.length === 0 && sections.today.length === 0;
  const row = (t: Task) => (
    <PlanRow
      key={t.id}
      task={t}
      flag={flags.get(t.id)}
      draggable={draggable}
      dayDrag={
        daysDrop
          ? { dragging: dragId === t.id, onStart: () => setDragId(t.id), onEnd: endDrag }
          : undefined
      }
      move={<MoveDayButton task={t} today={today} onMove={moveTask} />}
    />
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2">
        <PlanMyDay tasks={tasks} />
        {sections.remaining > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground">
              {formatDurationShort(sections.remaining)}
            </span>{" "}
            left today
          </span>
        )}
      </div>

      {/* The rack's "there is more" is a fade, not a hard cut: the list's
          last row dissolves into the card above the quick-add. */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-1 pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]"
      >
        {isPending ? (
          <div className="space-y-2 p-2" aria-label="Loading the plan">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-3 py-6 text-center text-xs text-balance text-muted-foreground">
            Couldn't load your tasks. They'll appear here once the connection is back.
          </p>
        ) : (
          <>
            {sections.overdue.length > 0 && (
              <section aria-label="Overdue">
                <SectionHeading tone="late" figure={sections.overdue.length}>
                  Overdue
                </SectionHeading>
                {overdueShown.map(row)}
                {hidden > 0 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-1 text-muted-foreground"
                    onClick={() => setShowAllOverdue(true)}
                  >
                    Show {hidden} more
                  </Button>
                )}
              </section>
            )}

            <section aria-label="Today" {...dropOn(today)} className={dropWash(today)}>
              <SectionHeading figure={sections.today.length || undefined} off={daysOff.get(today)}>
                Today
              </SectionHeading>
              {sections.today.map(row)}
              {nothingToday && (
                <p className="px-2 pt-1 pb-3 text-xs text-balance text-muted-foreground">
                  Nothing planned for today. Add a task below, or start the timer on anything —
                  a task is never required to track time.
                </p>
              )}
            </section>

            {sections.upcoming.map(({ day, tasks: list }) => (
              <section
                key={day}
                aria-label={dayHeading(day, today)}
                {...dropOn(day)}
                className={dropWash(day)}
              >
                <SectionHeading empty={list.length === 0} off={daysOff.get(day)}>
                  {dayHeading(day, today)}
                </SectionHeading>
                {list.map(row)}
              </section>
            ))}
          </>
        )}
      </div>

      <div className="border-t p-2">
        <QuickAddTask
          stacked
          defaultDueDate={today}
          placeholder="Add a task for today"
        />
      </div>
    </>
  );
}

/**
 * The plan side of the Timer: a standing column beside the list and the grid.
 *
 * The plan and the actual share one screen because comparing them is the job:
 * a planned block with nothing tracked beside it, a task running past its
 * estimate, what to start next. The column stays open by default and folds to
 * a slim strip (with the day's count) rather than disappearing, so the plan is
 * never one navigation away. The Tasks page keeps the whole backlog, the board
 * and history; this is today and the week ahead.
 */
export function PlanColumn({ draggable }: { draggable: boolean }) {
  const open = useUIStore((s) => s.planColumnOpen);
  const setOpen = useUIStore((s) => s.setPlanColumnOpen);
  const today = useDayRollover();
  const { data: tasks = [] } = useAllTasks();
  const dueCount = tasks.filter(
    (t) => t.active && !t.parentId && t.dueDate && compareLocalDates(t.dueDate, today) <= 0
  ).length;

  if (!open) {
    return (
      <div className="my-2 ml-4 flex w-10 shrink-0 flex-col items-center rounded-container border bg-card pt-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Show today's plan"
          title="Today's plan"
          onClick={() => setOpen(true)}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        {dueCount > 0 && (
          <span className="mt-1 text-micro tabular-nums text-muted-foreground">{dueCount}</span>
        )}
      </div>
    );
  }

  return (
    <aside
      aria-label="Today's plan"
      className="my-2 ml-4 flex w-80 shrink-0 flex-col overflow-hidden rounded-container border bg-card"
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Plan</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Hide today's plan"
          title="Hide the plan"
          onClick={() => setOpen(false)}
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </Button>
      </div>
      <PlanBody draggable={draggable} />
    </aside>
  );
}

/**
 * The same plan where the column can't stand: below lg, and beside the dense
 * grids (Split, Timesheet, Planner) that a third column would crush. A header
 * button opens it as a left sheet; there is no grid to drag onto from a sheet.
 */
export function PlanSheetButton() {
  const [open, setOpen] = useState(false);
  const today = useDayRollover();
  const { data: tasks = [] } = useAllTasks();
  const flags = usePlanFlags(tasks);
  const dueCount = tasks.filter(
    (t) => t.active && !t.parentId && t.dueDate && compareLocalDates(t.dueDate, today) <= 0
  ).length;
  const flagged = flags.size > 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="relative gap-1.5"
        aria-label={`Today's plan${dueCount ? `, ${dueCount} ${dueCount === 1 ? "task" : "tasks"}` : ""}${flagged ? ", needs attention" : ""}`}
        title="Today's plan"
        onClick={() => setOpen(true)}
      >
        <ListChecks aria-hidden className="h-4 w-4" />
        <span className="font-mono tabular-nums">{dueCount}</span>
        {flagged && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-warning" />
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0">
          <SheetHeader className="px-3 pt-3 pb-1">
            <SheetTitle>Plan</SheetTitle>
            <SheetDescription className="sr-only">
              Today's tasks, what's overdue and the week ahead.
            </SheetDescription>
          </SheetHeader>
          <PlanBody draggable={false} />
        </SheetContent>
      </Sheet>
    </>
  );
}
