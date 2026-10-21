import { useEffect, useMemo, useRef, useState } from "react";
import { ListChecks, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { Task } from "@timetracker/core/schemas";
import { addLocalDays, compareLocalDates } from "@timetracker/core/task-recurrence";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useAllTasks } from "@/hooks/useTasks";
import { usePlanFlags } from "@/hooks/usePlanFlags";
import { useDayRollover } from "@/hooks/useDayRollover";
import { useUIStore } from "@/stores/uiStore";
import { comparePlanned, formatDueHeading, formatMinute } from "@/lib/taskUtils";

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
import { formatDurationShort } from "@/lib/dateUtils";
import type { PlanFlag } from "@/lib/planState";
import { cn } from "@/lib/utils";

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
      upcoming: [...byDay].map(([day, list]) => ({ day, tasks: list })),
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

function PlanRow({ task, flag, draggable }: { task: Task; flag?: PlanFlag; draggable: boolean }) {
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);
  const meta = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-micro text-muted-foreground">
        <ColorDot color={task.projectColor} className="h-1.5 w-1.5" />
        <span className="min-w-0 flex-1 truncate">{task.projectName}</span>
        {task.estimatedSeconds ? (
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
          : undefined
      }
    >
      <TaskRow
        task={task}
        dense
        denseMeta={meta}
        onRequestDelete={() => {}}
        onLogTime={(t) => openTaskLogTime(t.id)}
      />
    </div>
  );
}

function SectionHeading({ children, figure, tone }: { children: React.ReactNode; figure?: React.ReactNode; tone?: "late" }) {
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
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useCalendarDraggable(listRef, draggable && !isPending);

  const overdueShown = showAllOverdue ? sections.overdue : sections.overdue.slice(0, OVERDUE_VISIBLE);
  const hidden = sections.overdue.length - overdueShown.length;
  const nothingToday = sections.overdue.length === 0 && sections.today.length === 0;
  const row = (t: Task) => <PlanRow key={t.id} task={t} flag={flags.get(t.id)} draggable={draggable} />;

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

            <section aria-label="Today">
              <SectionHeading figure={sections.today.length || undefined}>Today</SectionHeading>
              {sections.today.map(row)}
              {nothingToday && (
                <p className="px-2 pt-1 pb-3 text-xs text-balance text-muted-foreground">
                  Nothing planned for today. Add a task below, or start the timer on anything —
                  a task is never required to track time.
                </p>
              )}
            </section>

            {sections.upcoming.map(({ day, tasks: list }) => (
              <section key={day} aria-label={dayHeading(day, today)}>
                <SectionHeading>{dayHeading(day, today)}</SectionHeading>
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
