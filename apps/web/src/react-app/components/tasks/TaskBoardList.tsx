import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Plus, ListChecks, Search, SearchX, AlertTriangle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CollectionHeader } from "@/components/layout/CollectionHeader";
import { Pane, PaneScroll } from "@/components/layout/Pane";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ColorDot } from "@/components/ColorDot";
import { TaskRow } from "./TaskRow";
import { QuickAddTask } from "./QuickAddTask";
import { TaskDialog } from "./TaskDialog";
import { TaskViewTabs, type TaskView } from "./TaskViewTabs";
import { useAllTasks, useCompleteTask, useDeleteTask, useUpdateTask } from "@/hooks/useTasks";
import { useTaskListKeys } from "@/hooks/useTaskListKeys";
import { TaskViewPopover, TaskViewPicker, type TaskGroupBy, type TaskSortBy } from "./TaskFilters";
import {
  NO_FILTERS,
  activeFilterCount,
  useActiveTaskView,
  type TaskFilterValues,
} from "@/lib/taskViews";
import { useUIStore } from "@/stores/uiStore";
import { formatDurationShort, localDayKey } from "@/lib/dateUtils";
import {
  comparePlanned,
  formatDueHeading,
  localDateToDate,
  midpointOrder,
  nest,
  withSubtasks,
  type TaskNode,
} from "@/lib/taskUtils";
import {
  addLocalDays,
  compareLocalDates,
  localWeekday,
  todayLocalDate,
} from "@timetracker/core/task-recurrence";
import { cn } from "@/lib/utils";
import type { Task } from "@timetracker/core/schemas";

type StatusFilter = "all" | "active" | "done";
type GroupBy = TaskGroupBy;
type SortBy = TaskSortBy;
/** The board's columns. Derived from `active` + `startedAt`, never stored as one field. */
type Stage = "todo" | "doing" | "done";

/** How long a finished task stays on the board before it's only in All → Done. */
const BOARD_DONE_DAYS = 7;

interface Section {
  key: string;
  label: string;
  color?: string | null;
  trackedSeconds: number;
  nodes: TaskNode[];
  /** Drag-to-reorder is only meaningful where the order is the user's own. */
  reorderable?: boolean;
  /** Board columns: dropping a card here moves it to this stage. */
  stage?: Stage;
  /** History weeks: "12h tracked · 110% of estimate", right-aligned. */
  summary?: string;
  /** All, open-only: finished top-level tasks in this group, kept out of the list. */
  doneCount?: number;
  /** The project a "+" on this group files new tasks under. */
  projectId?: string;
}

/** How many weeks of finished work History shows; older is under All → Done. */
const HISTORY_WEEKS = 8;

const SORTERS: Record<SortBy, (a: Task, b: Task) => number> = {
  plan: comparePlanned,
  priority: (a, b) => a.priority - b.priority || comparePlanned(a, b),
  name: (a, b) => a.name.localeCompare(b.name),
  estimate: (a, b) => (b.estimatedSeconds ?? 0) - (a.estimatedSeconds ?? 0),
  tracked: (a, b) => b.trackedSeconds - a.trackedSeconds,
  recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
};

/** Tracked total for a node and everything under it, without double-counting. */
function nodeSeconds(node: TaskNode) {
  // `trackedSeconds` on a parent already rolls its children up (TASK_SELECT),
  // so summing the children again here would count every subtask twice.
  return node.task.trackedSeconds;
}

export function TaskBoardList() {
  const { data: tasks = [], isLoading, isError, refetch } = useAllTasks();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);

  const [view, setView] = useState<TaskView>("all");
  /** All: status + project / tag / priority / due, edited in the filter popover. */
  const [filters, setFilters] = useState<TaskFilterValues>(NO_FILTERS);
  const status: StatusFilter = filters.status;
  const setStatus = (s: StatusFilter) => setFilters((f) => ({ ...f, status: s }));
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [sortBy, setSortBy] = useState<SortBy>("plan");
  /** All: free-text filter over names and notes. */
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  /** Subtask checklists start closed: a card is one task until you open it. */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  /** Groups whose finished tasks are showing, from their "n done" line. */
  const [doneShownIn, setDoneShownIn] = useState<Set<string>>(new Set());
  /** The group a "+" opened a capture line in. */
  const [addingTo, setAddingTo] = useState<string | null>(null);
  /** Search is an icon until it's wanted; it stays open while it holds a query. */
  const [searchOpen, setSearchOpen] = useState(false);
  const [subtaskParent, setSubtaskParent] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  /** The row a drag is currently over; the insertion line is drawn above it. */
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  /** Board: the column a drag is over, which changes stage on drop. */
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const currentView = { query, groupBy, sortBy, ...filters };
  const activeView = useActiveTaskView(activeViewId, currentView);

  // Q on this page, Alt+Shift+T from anywhere (which navigates here with a
  // `capture` stamp): straight into the capture line. With no tasks yet there
  // is no line — the empty state's dialog is the capture surface then.
  const focusCapture = useCallback(() => {
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Add a task"]');
    if (field) field.focus();
    else setAddOpen(true);
  }, []);
  useTaskListKeys({ tasks, onEdit: setEditTarget, onCapture: focusCapture });
  const navState = useLocation().state as { capture?: number; groupBy?: GroupBy } | null;
  const captureStamp = navState?.capture;
  // The task nudges land here grouped by due date, overdue days first. Taken
  // once per navigation (state is a fresh object each time), during render.
  const [seenNav, setSeenNav] = useState<typeof navState>(null);
  if (navState !== seenNav) {
    setSeenNav(navState);
    if (navState?.groupBy) {
      setView("all");
      setGroupBy(navState.groupBy);
    }
  }
  useEffect(() => {
    if (!captureStamp || isLoading) return;
    // A frame later: straight after navigating here the line hasn't mounted.
    const frame = requestAnimationFrame(focusCapture);
    return () => cancelAnimationFrame(frame);
  }, [captureStamp, isLoading, focusCapture]);

  const today = todayLocalDate();
  const weekStartsOn = useUIStore((s) => s.weekStart);
  /** The local day a week containing `day` starts on, by the week-start pref. */
  const weekStartOf = useCallback(
    (day: string) => addLocalDays(day, -((localWeekday(day) - weekStartsOn + 7) % 7)),
    [weekStartsOn]
  );
  const thisWeekStart = weekStartOf(today);
  const hasAnyTask = tasks.length > 0;
  
  const sections = useMemo<Section[]>(() => {
    const compare = SORTERS[sortBy];

    // ─── History ────────────────────────────────────────────────────────────
    //
    // Finished top-level tasks by the week they were finished in, newest
    // first. The point is the review a plain to-do list can't give: each week
    // puts what got done beside what it actually cost against what was
    // estimated, so estimates can get better.
    if (view === "history") {
      const oldest = addLocalDays(thisWeekStart, -7 * (HISTORY_WEEKS - 1));
      const byWeek = new Map<string, Task[]>();
      for (const t of tasks) {
        if (t.active || t.parentId || !t.completedAt) continue;
        const day = localDayKey(t.completedAt);
        const week = weekStartOf(day);
        if (compareLocalDates(week, oldest) < 0) continue;
        byWeek.set(week, [...(byWeek.get(week) ?? []), t]);
      }
      return [...byWeek.entries()]
        .sort(([a], [b]) => compareLocalDates(b, a))
        .map(([week, done]) => {
          done.sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
          const tracked = done.reduce((sum, t) => sum + t.trackedSeconds, 0);
          const estimated = done.filter((t) => t.estimatedSeconds);
          const estimate = estimated.reduce((sum, t) => sum + (t.estimatedSeconds ?? 0), 0);
          const trackedOnEstimated = estimated.reduce((sum, t) => sum + t.trackedSeconds, 0);
          const nodes = nest(withSubtasks(done, tasks), () => 0);
          return {
            key: `week:${week}`,
            label:
              week === thisWeekStart
                ? "This week"
                : week === addLocalDays(thisWeekStart, -7)
                  ? "Last week"
                  : `Week of ${formatDueHeading(week, today).replace(/^[^·]*· /, "")}`,
            nodes,
            trackedSeconds: tracked,
            // Only over tasks that had an estimate — an unestimated task says
            // nothing about how good the estimates were. With nothing tracked
            // there is no ratio to report, only the fact.
            summary:
              tracked === 0
                ? "No time tracked"
                : [
                    `${formatDurationShort(tracked)} tracked`,
                    estimate > 0
                      ? `${Math.round((trackedOnEstimated / estimate) * 100)}% of estimate`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
          };
        });
    }

    // ─── Board ──────────────────────────────────────────────────────────────
    //
    // Top-level tasks only, like every other view: a subtask rides its parent's
    // card. Done keeps a week of finished work — long enough to review, short
    // enough that the column doesn't become the archive (All → Done is that).
    if (view === "board") {
      // Local midnight N days back, from `today` rather than the clock so the
      // memo stays pure and rolls over with the day like the other views.
      const doneSince = localDateToDate(addLocalDays(today, -BOARD_DONE_DAYS)).toISOString();
      const top = tasks.filter((t) => !t.parentId);
      const byStage: Record<Stage, Task[]> = {
        todo: top.filter((t) => t.active && !t.startedAt),
        doing: top.filter((t) => t.active && t.startedAt),
        // A card ticked a moment ago has no `completedAt` until the refetch
        // lands; it counts as just now rather than blinking out and back.
        done: top.filter((t) => !t.active && (!t.completedAt || t.completedAt >= doneSince)),
      };
      const recentFirst = (a: Task, b: Task) =>
        (b.completedAt ?? "\uffff").localeCompare(a.completedAt ?? "\uffff");
      const column = (stage: Stage, label: string): Section => {
        const nodes = nest(
          withSubtasks(byStage[stage], tasks),
          stage === "done" ? recentFirst : comparePlanned
        );
        return {
          key: stage,
          label,
          stage,
          nodes,
          trackedSeconds: nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
        };
      };
      return [column("todo", "To do"), column("doing", "In progress"), column("done", "Done")];
    }

    // ─── All ────────────────────────────────────────────────────────────────
    // A match keeps its context: a matching subtask brings its parent (a
    // subtask on its own renders nowhere), and a matching parent keeps its
    // whole checklist.
    const q = query.trim().toLowerCase();
    const matches = (t: Task) =>
      t.name.toLowerCase().includes(q) || (t.description?.toLowerCase().includes(q) ?? false);
    const matchedParents = new Set(tasks.filter((t) => !t.parentId && matches(t)).map((t) => t.id));
    const parentsOfMatches = new Set(
      tasks.filter((t) => t.parentId && matches(t)).map((t) => t.parentId as string)
    );
    const inQuery = (t: Task) =>
      !q ||
      matches(t) ||
      (t.parentId ? matchedParents.has(t.parentId) : parentsOfMatches.has(t.id));

    // Project / tag / priority / due judge the top-level task; a subtask
    // follows its parent (it has no due date of its own and rides its row).
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const weekEnd = addLocalDays(today, 6);
    const passes = (t: Task) => {
      if (filters.projectId && t.projectId !== filters.projectId) return false;
      if (filters.tag && !t.tags.includes(filters.tag)) return false;
      if (filters.maxPriority && t.priority > filters.maxPriority) return false;
      switch (filters.due) {
        case "overdue":
          return !!t.dueDate && compareLocalDates(t.dueDate, today) < 0;
        case "today":
          return t.dueDate === today;
        case "week":
          return (
            !!t.dueDate &&
            compareLocalDates(t.dueDate, today) >= 0 &&
            compareLocalDates(t.dueDate, weekEnd) <= 0
          );
        case "none":
          return !t.dueDate;
        default:
          return true;
      }
    };
    const passesFilters = (t: Task) => {
      const owner = t.parentId ? byId.get(t.parentId) : t;
      return owner ? passes(owner) : false;
    };

    // A drag writes the midpoint of its *visible* neighbours; with a search
    // or filter hiding rows between them, that lands somewhere unseen.
    const narrowed = !!q || activeFilterCount(filters) > 0;

    // Status judges the top-level task, like the other filters: a ticked
    // subtask is part of an open checklist and stays in it ("1/3" with the
    // done one showing), not filtered out from under its parent.
    const statusOk = (t: Task) => (status === "all" ? true : status === "active" ? t.active : !t.active);
    const filtered = tasks.filter((t) => inQuery(t) && passesFilters(t));
    /** A group's rows: what passes status, plus its done tasks once revealed. */
    const visible = (bucket: Task[], key: string) =>
      bucket.filter((t) => {
        const owner = t.parentId ? byId.get(t.parentId) : t;
        if (!owner) return false;
        return statusOk(owner) || (status === "active" && !owner.active && doneShownIn.has(key));
      });
    const hiddenDone = (bucket: Task[]) =>
      status === "active" ? bucket.filter((t) => !t.parentId && !t.active).length : 0;

    if (groupBy === "none") {
      const nodes = nest(visible(filtered, "all"), compare);
      return nodes.length
        ? [
            {
              key: "all",
              label: "All tasks",
              trackedSeconds: nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
              nodes,
              reorderable: sortBy === "plan" && !narrowed,
              doneCount: hiddenDone(filtered),
            },
          ]
        : [];
    }

    const map = new Map<string, { label: string; color?: string | null; tasks: Task[] }>();
    for (const t of filtered) {
      let key: string;
      let label: string;
      if (groupBy === "project") {
        key = t.projectId ?? "none";
        label = t.projectName ?? "No project";
      } else if (groupBy === "status") {
        key = t.active ? "active" : "done";
        label = t.active ? "Active" : "Done";
      } else {
        key = t.dueDate ?? "none";
        label = t.dueDate ? formatDueHeading(t.dueDate, today) : "No due date";
      }
      let bucket = map.get(key);
      if (!bucket) {
        bucket = {
          label,
          color: groupBy === "project" ? t.projectColor : null,
          tasks: [],
        };
        map.set(key, bucket);
      }
      bucket.tasks.push(t);
    }

    const entries = [...map.entries()].map(([key, b]) => {
      const nodes = nest(visible(b.tasks, key), compare);
      return {
        key,
        label: b.label,
        color: b.color,
        nodes,
        doneCount: hiddenDone(b.tasks),
        projectId: groupBy === "project" && key !== "none" ? key : undefined,
        trackedSeconds: nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
        // Ordering is only the user's own inside a project; in any other
        // grouping a drag would be rewriting a sequence the group doesn't own.
        reorderable: groupBy === "project" && sortBy === "plan" && !narrowed,
      };
    });

    // A group whose tasks are all finished has nothing open to show; it goes
    // with them, the same way a ticked row does.
    const live = entries.filter((e) => e.nodes.length > 0);
    // Due groups sort chronologically ("No due date" last); everything else by name.
    return groupBy === "due"
      ? live.sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.key.localeCompare(b.key)))
      : live.sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks, view, status, groupBy, sortBy, today, query, filters, thisWeekStart, weekStartOf, doneShownIn]);

  // A board with empty columns is still a board; only a workspace with no tasks
  // at all gets the first-run state there.
  const isEmpty = view === "board" ? !hasAnyTask : sections.every((s) => s.nodes.length === 0);

  // Of *top-level* open tasks: a subtask rides its parent's row, so counting
  // them would make "All 3" disagree with the three rows underneath. Board and
  // History carry no count — the board's was its in-progress number, which
  // read as "one task on the board" over a board of ten.
  const allCount = useMemo(() => tasks.filter((t) => !t.parentId && t.active).length, [tasks]);

  /** Commit a drag: one row's `sort_order` becomes the midpoint of its new neighbours. */
  const handleDrop = (ordered: Task[], toIndex: number) => {
    setDragOverId(null);
    if (!dragId) return;
    const fromIndex = ordered.findIndex((t) => t.id === dragId);
    setDragId(null);
    if (fromIndex === -1 || fromIndex === toIndex) return;
    const without = ordered.filter((t) => t.id !== dragId);
    const before = without[toIndex - 1] ?? null;
    const after = without[toIndex] ?? null;
    updateTask.mutate({
      id: dragId,
      data: { sortOrder: midpointOrder(before?.sortOrder ?? null, after?.sortOrder ?? null) },
    });
  };

  /**
   * Commit a board drag. Stage is two fields, so each move sets what it needs:
   * reopening a done task, and setting or clearing `startedAt`. Done goes
   * through `completeTask` so a card dragged there gets the same recurrence
   * spawn and Undo toast as a ticked checkbox.
   */
  const handleStageDrop = (stage: Stage) => {
    setDragOverStage(null);
    const id = dragId;
    setDragId(null);
    const task = id ? tasks.find((t) => t.id === id) : undefined;
    if (!task) return;
    if (stage === "done") {
      if (task.active) completeTask(task, true);
      return;
    }
    const inProgress = stage === "doing";
    if (!task.active) {
      updateTask.mutate({ id: task.id, data: { active: true, inProgress } });
    } else if (Boolean(task.startedAt) !== inProgress) {
      updateTask.mutate({ id: task.id, data: { inProgress } });
    }
  };

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Three empty states, not one. "No tasks yet" teaches the surface; "nothing
  // due today" is a *result* and should read like one; "this filter matched
  // nothing" is a dead end that needs a way out. Collapsing them into a single
  // "Nothing here" is how an empty Today comes across as a broken page.
  let empty: React.ReactNode = null;
  if (isError && !isLoading) {
    // A failed fetch must never read as the first-run invitation: "What do you
    // plan to work on?" over a list that exists is the wrong question.
    empty = (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load tasks"
        description="The request didn't get through. Your tracked time is safe."
        className="py-24"
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (isEmpty && !isLoading) {
    if (!hasAnyTask) {
      empty = (
        <EmptyState
          icon={ListChecks}
          title="What do you plan to work on?"
          description="Create a task to start planning your projects, then start a timer on it in one click."
          className="py-24"
          action={
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Create a task
            </Button>
          }
        />
      );
    } else if (view === "all" && !query.trim() && activeFilterCount(filters) === 0) {
      // Open-only by default, so an empty list with tasks in the workspace is
      // a finished list — a result, not a filter that matched nothing.
      empty = (
        <EmptyState
          icon={ListChecks}
          title="Nothing left open"
          description="Every task is done. Finished work is in History."
          className="py-24"
          action={
            <Button size="sm" variant="outline" onClick={() => setStatus("all")}>
              Show done tasks
            </Button>
          }
        />
      );
    } else {
      empty = query.trim() ? (
        <EmptyState
          icon={SearchX}
          title={`Nothing matches “${query.trim()}”`}
          description={
            status === "all"
              ? "No task name or note contains that text."
              : `Searching ${status === "done" ? "done" : "open"} tasks only.`
          }
          className="py-24"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
              {status !== "all" && (
                <Button size="sm" variant="ghost" onClick={() => setStatus("all")}>
                  Include {status === "done" ? "open" : "done"} tasks
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <EmptyState
          icon={SearchX}
          title="No tasks match these filters"
          description={
            activeFilterCount(filters) === 1 && status === "done"
              ? "Showing done tasks only."
              : "Nothing passes every filter at once."
          }
          className="py-24"
          action={
            <Button size="sm" variant="outline" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      );
    }
  }

  /**
   * `grouped`: the row sits inside its group's one card, divided from its
   * neighbours by a hairline, rather than being a card of its own. A stack of
   * separate cards read as a feed; a to-do list reads as one column of lines.
   * Board cards stay cards — moving them is the point of the board.
   */
  const renderNode = (
    node: TaskNode,
    ordered: Task[],
    index: number,
    section: Section,
    grouped = false
  ) => {
    // A search opens every checklist: a subtask that matched is the reason its
    // parent is on screen, so it can't be folded away under it.
    const open = expandedIds.has(node.task.id) || (view === "all" && !!query.trim());
    const dragging = dragId === node.task.id;
    // A drop lands *before* this row, so the line is drawn above the row under
    // the pointer — and not above the row being dragged, where it would promise
    // a move to the place it already is.
    const dropTarget = !!dragId && !dragging && dragOverId === node.task.id;
    // Board cards drag between columns; the drop is caught by the column
    // (see `handleStageDrop`), not the card — there is no in-column order.
    const dragHandlers = view === "board"
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.effectAllowed = "move";
            setDragId(node.task.id);
          },
          onDragEnd: () => {
            setDragId(null);
            setDragOverStage(null);
          },
        }
      : section.reorderable
      ? {
          draggable: true,
          onDragStart: () => setDragId(node.task.id),
          onDragEnd: () => {
            setDragId(null);
            setDragOverId(null);
          },
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setDragOverId(node.task.id);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            handleDrop(ordered, index);
          },
        }
      : undefined;

    return (
      <div key={node.task.id} className="relative">
        {/* Insertion line, centred in the 8px gap above the card. Ink, not the
            accent: it is the same "this is the filled part" vocabulary as the
            progress bar and the segment pill. Outside the card so the card can
            keep clipping its rows' washes to its corners. */}
        {dropTarget && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-3 z-sticky h-0.5 rounded-full bg-foreground",
              grouped ? "-top-px" : "-top-[5px]"
            )}
          />
        )}
        <div
          className={cn(
            grouped
              ? "transition-opacity duration-fast ease-out-quart"
              : // The card wakes its *edge* on hover, like every other row card
                // (The Hairline Rule); the wash inside belongs to the rows it groups.
                "overflow-hidden rounded-container border bg-card transition-[border-color,opacity] duration-fast ease-out-quart hover:border-border-strong",
            dragging && "opacity-50"
          )}
        >
          <TaskRow
            task={node.task}
            showProject={groupBy !== "project" || view !== "all"}
            expanded={open}
            onToggleExpanded={() => toggleExpanded(node.task.id)}
            onRequestDelete={deleteTask}
            onEdit={setEditTarget}
            onLogTime={(t) => openTaskLogTime(t.id)}
            onAddSubtask={(t) => {
              setExpandedIds((prev) => new Set(prev).add(t.id));
              setSubtaskParent(t.id);
            }}
            dragHandlers={dragHandlers}
            dragging={dragging}
          />
          {open && node.children.length > 0 && (
            <div className="border-t">
              {node.children.map((child) => (
                <TaskRow
                  key={child.id}
                  task={child}
                  nested
                  onRequestDelete={deleteTask}
                  onEdit={setEditTarget}
                  onLogTime={(t) => openTaskLogTime(t.id)}
                />
              ))}
            </div>
          )}
          {subtaskParent === node.task.id && (
            <div className="border-t px-3 py-1.5 pl-9">
              <QuickAddTask
                autoFocus
                parentId={node.task.id}
                placeholder="Add a subtask"
                onDone={() => setSubtaskParent(null)}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Pane>
      {/* Same header shape as Projects and Clients. This used to be a bordered
          toolbar with a `text-sm` <h1> — a page title rendered at body size,
          6px under every sibling page's, in the one collection page that also
          centred itself in a 768px column. */}
      <CollectionHeader title="Tasks">
        <TaskViewTabs view={view} allCount={allCount} onChange={setView} />

        {/* Looking and shaping only mean anything in All — Board and History
            *are* a shape. Search is the one thing reached for mid-task, so it
            keeps a button of its own; everything else is behind View. */}
        {view === "all" && (
          <>
            {searchOpen || query ? (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setQuery("");
                      setSearchOpen(false);
                    }
                  }}
                  onBlur={() => !query && setSearchOpen(false)}
                  placeholder="Search tasks"
                  aria-label="Search tasks"
                  className="h-8 w-40 pr-8 pl-8 text-sm sm:w-48"
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close search"
                    title="Clear and close search"
                    onClick={() => {
                      setQuery("");
                      setSearchOpen(false);
                    }}
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Search"
                title="Search tasks"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-4 w-4" />
              </Button>
            )}
            <TaskViewPopover
              value={filters}
              onChange={setFilters}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              viewName={activeView?.name ?? null}
              viewSlot={
                <TaskViewPicker
                  current={currentView}
                  activeViewId={activeViewId}
                  onApply={(id, config) => {
                    setActiveViewId(id);
                    if (!config) return;
                    setQuery(config.query);
                    setGroupBy(config.groupBy);
                    setSortBy(config.sortBy);
                    setFilters({
                      status: config.status,
                      projectId: config.projectId,
                      tag: config.tag,
                      maxPriority: config.maxPriority,
                      due: config.due,
                    });
                  }}
                />
              }
            />
          </>
        )}
        {/* No "Add task" button: the capture line under this header is the one
            way in, and Q focuses it. A second, louder button that opened a
            dialog for the same job was the first thing on the page to compete
            with the list. */}
      </CollectionHeader>

      <PaneScroll>
        {isLoading ? (
          // The shape of what is coming — capture line, a group heading, three
          // two-line rows — so the loaded page lands on the skeleton instead of
          // reflowing past four anonymous bars.
          <div aria-busy="true" aria-label="Loading tasks">
            <Skeleton className="mb-4 h-[42px] w-full rounded-full" />
            <Skeleton className="mb-2 ml-2 h-3 w-24" />
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-[52px] w-full rounded-container" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Nothing to capture into a record of what's finished. */}
            {hasAnyTask && view !== "history" && (
              <QuickAddTask
                className="mb-4"
                defaultDueDate={null}
                placeholder={undefined}
              />
            )}

            {empty ?? (view === "board" ? (
              // Columns side by side from md up; stacked on a phone, where
              // cards move through the ⋯ menu (HTML drag doesn't exist on touch).
              // Done is a record, not a workspace: it gets less of the width,
              // and the two columns you work in get more.
              <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
                {sections.map((section) => {
                  const stage = section.stage!;
                  const ordered = section.nodes.map((n) => n.task);
                  return (
                    <section
                      key={section.key}
                      aria-label={section.label}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverStage !== stage) setDragOverStage(stage);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                          setDragOverStage((cur) => (cur === stage ? null : cur));
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleStageDrop(stage);
                      }}
                      className={cn(
                        // Same wash-as-outline as Upcoming's days: lighting a
                        // column up must not move anything under the pointer.
                        "min-w-0 rounded-container transition-colors duration-fast ease-out-quart",
                        // Stacked on a phone, what you're doing now comes first
                        // rather than under every card still waiting.
                        stage === "doing" && "max-md:order-first",
                        dragOverStage === stage && "bg-muted outline-8 outline-solid outline-muted"
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2 px-2">
                        <h2 className="text-xs font-medium text-muted-foreground">{section.label}</h2>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {section.nodes.length}
                        </span>
                        {stage === "done" && (
                          <span className="text-xs text-muted-foreground">· last {BOARD_DONE_DAYS} days</span>
                        )}
                        {section.trackedSeconds > 0 && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            <span className="font-mono tabular-nums">
                              {formatDurationShort(section.trackedSeconds)}
                            </span>{" "}
                            tracked
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {section.nodes.map((node, i) => renderNode(node, ordered, i, section))}
                        {section.nodes.length === 0 && (
                          <p className="rounded-container border border-dashed px-3 py-4 text-xs text-muted-foreground">
                            {stage === "todo"
                              ? "Nothing waiting. New tasks land here."
                              : stage === "doing"
                                ? "Start a timer on a task, or drag one here."
                                : `Tasks you finish stay here for ${BOARD_DONE_DAYS} days.`}
                          </p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-6">
                {sections.map((section) => {
                  const ordered = section.nodes.map((n) => n.task);
                  const doneShown = doneShownIn.has(section.key);
                  return (
                    <div key={section.key}>
                      <div className="mb-1 flex items-center gap-2 px-2">
                        {groupBy === "project" && view === "all" && <ColorDot color={section.color} />}
                        {/* Sentence case at Label weight. Uppercase + tracking on every group
                            heading is the eyebrow pattern PRODUCT.md and DESIGN.md §8 both
                            reject by name; the ColorDot and count already do the work. */}
                        <h2 className="text-xs font-medium text-muted-foreground">
                          {section.label}
                        </h2>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {/* Open tasks: revealing the done ones doesn't
                              change how much is left. */}
                          {view === "all"
                            ? section.nodes.filter((n) => n.task.active).length
                            : section.nodes.length}
                        </span>
                        {/* Files the new task under this group's project, so it
                            lands where you were looking rather than in a group
                            you'd have to scroll to. */}
                        {section.projectId && view === "all" && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Add a task to ${section.label}`}
                            title={`Add a task to ${section.label}`}
                            onClick={() => setAddingTo(section.key)}
                            className="text-muted-foreground"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        )}
                        {section.summary ? (
                          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                            {section.summary}
                          </span>
                        ) : (
                          section.trackedSeconds > 0 && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              <span className="font-mono tabular-nums">
                                {formatDurationShort(section.trackedSeconds)}
                              </span>{" "}
                              tracked
                            </span>
                          )
                        )}
                      </div>
                      <div className="overflow-hidden rounded-container border bg-card divide-y">
                        {section.nodes.map((node, i) => renderNode(node, ordered, i, section, true))}
                        {addingTo === section.key && section.projectId && (
                          <div className="px-3 py-1.5">
                            <QuickAddTask
                              autoFocus
                              defaultProjectId={section.projectId}
                              defaultDueDate={null}
                              placeholder={`Add to ${section.label}`}
                              onDone={() => setAddingTo(null)}
                            />
                          </div>
                        )}
                      </div>
                      {/* Ticked tasks leave the list; this is the trace they
                          leave, and the way back to them without leaving the
                          group you're in. */}
                      {(section.doneCount ?? 0) > 0 && (
                        <button
                          type="button"
                          aria-expanded={doneShown}
                          onClick={() =>
                            setDoneShownIn((prev) => {
                              const next = new Set(prev);
                              if (next.has(section.key)) next.delete(section.key);
                              else next.add(section.key);
                              return next;
                            })
                          }
                          className="mt-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground transition-colors duration-fast ease-out-quart hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          {doneShown ? `Hide ${section.doneCount} done` : `${section.doneCount} done`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </PaneScroll>

      <TaskDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultDueDate={null}
      />

      <TaskDialog
        open={!!editTarget}
        task={editTarget}
        onClose={() => setEditTarget(null)}
      />

    </Pane>
  );
}
