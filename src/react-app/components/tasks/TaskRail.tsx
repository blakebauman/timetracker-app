import { useEffect, useRef } from "react";
import { Draggable } from "@fullcalendar/interaction";
import { ListChecks, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskRow } from "./TaskRow";
import { QuickAddTask } from "./QuickAddTask";
import { useAllTasks } from "@/hooks/useTasks";
import { useUIStore } from "@/stores/uiStore";
import { comparePlanned } from "@/lib/taskUtils";
import { addLocalDays, compareLocalDates, todayLocalDate } from "@shared/task-recurrence";

/**
 * Today's tasks, beside the grid you're tracking into.
 *
 * The rail exists for adjacency, not for features: one-click start and
 * drag-to-slot only pay off when the plan and the day are on screen together,
 * and a task list one navigation away is a task list you check twice a week.
 * Everything that isn't identity or action is stripped — the full surface is at
 * /tasks.
 *
 * Rows are registered with FullCalendar's `Draggable` so they can be dropped
 * straight onto the grid; the drop is handled in CalendarBody, which owns the
 * entry mutation.
 */
export function TaskRail() {
  const open = useUIStore((s) => s.taskRailOpen);
  const setOpen = useUIStore((s) => s.setTaskRailOpen);
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);
  const { data: tasks = [], isLoading } = useAllTasks();
  const listRef = useRef<HTMLDivElement>(null);

  // `create: false` — FullCalendar must not mint a placeholder event of its own.
  // The drop handler writes a real entry and the query invalidation paints it;
  // letting FC also add one leaves a ghost that survives until the next refetch.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const draggable = new Draggable(listRef.current, {
      itemSelector: "[data-task-drag]",
      eventData: () => ({ create: false }),
    });
    return () => draggable.destroy();
  }, [open]);

  const today = todayLocalDate();
  const due = tasks
    .filter(
      (t) =>
        t.active &&
        t.dueDate &&
        compareLocalDates(t.dueDate, addLocalDays(today, 0)) <= 0
    )
    .sort(comparePlanned);

  if (!open) {
    return (
      <div className="hidden w-10 shrink-0 flex-col items-center border-l pt-3 lg:flex">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Show today's tasks"
          title="Today's tasks"
          onClick={() => setOpen(true)}
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        {due.length > 0 && (
          <span className="mt-1 text-micro tabular-nums text-muted-foreground">{due.length}</span>
        )}
      </div>
    );
  }

  return (
    <aside
      aria-label="Today's tasks"
      className="hidden w-72 shrink-0 flex-col border-l lg:flex"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {/* "Today", not "Due today": the list deliberately carries overdue work
            forward, and a heading that names only today makes an overdue row
            look like a bug. Same rule as the Tasks page's Today view. */}
        <h2 className="text-xs font-medium">Today</h2>
        <span className="text-xs text-muted-foreground/70">{due.length}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Hide today's tasks"
          onClick={() => setOpen(false)}
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : due.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-balance text-muted-foreground">
            Nothing due today. Add one below, or drag any task here from Tasks.
          </p>
        ) : (
          <div className="space-y-0.5">
            {due.map((task) => (
              <div
                key={task.id}
                data-task-drag
                data-task-id={task.id}
                data-project-id={task.projectId}
                data-task-name={task.name}
                data-estimate={task.estimatedSeconds ?? ""}
                title="Drag onto the grid to log this at that time"
              >
                <TaskRow
                  task={task}
                  dense
                  onRequestDelete={() => {}}
                  onLogTime={(t) => openTaskLogTime(t.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t p-2">
        <QuickAddTask
          stacked
          defaultDueDate={today}
          placeholder="Add a task for today"
        />
      </div>
    </aside>
  );
}
