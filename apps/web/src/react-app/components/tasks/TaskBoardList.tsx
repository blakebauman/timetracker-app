import { useMemo, useState } from "react";
import { Plus, ListChecks, CalendarCheck, SearchX, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollectionHeader } from "@/components/layout/CollectionHeader";
import { Pane, PaneScroll } from "@/components/layout/Pane";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ColorDot } from "@/components/ColorDot";
import { TaskRow } from "./TaskRow";
import { QuickAddTask } from "./QuickAddTask";
import { TaskDialog } from "./TaskDialog";
import { TaskViewTabs, type TaskView } from "./TaskViewTabs";
import { useAllTasks, useDeleteTask, useUpdateTask } from "@/hooks/useTasks";
import { BELOW_SM, useMediaQuery } from "@/hooks/useMediaQuery";
import { useUIStore } from "@/stores/uiStore";
import { formatDurationShort } from "@/lib/dateUtils";
import {
  comparePlanned,
  formatDueHeading,
  midpointOrder,
  nest,
  withSubtasks,
  type TaskNode,
} from "@/lib/taskUtils";
import {
  addLocalDays,
  compareLocalDates,
  todayLocalDate,
} from "@timetracker/core/task-recurrence";
import { cn } from "@/lib/utils";
import type { Task } from "@timetracker/core/schemas";

type StatusFilter = "all" | "active" | "done";
type GroupBy = "project" | "status" | "due" | "none";
type SortBy = "name" | "estimate" | "tracked" | "recent" | "plan";

interface Section {
  key: string;
  label: string;
  color?: string | null;
  tone?: "overdue";
  trackedSeconds: number;
  nodes: TaskNode[];
  /** Drag-to-reorder is only meaningful where the order is the user's own. */
  reorderable?: boolean;
}

/**
 * What the quick-add line files a task under when the line itself says nothing.
 *
 * Each view is a promise about what it shows, and the field sits inside that
 * promise: Today captures for today, Upcoming for tomorrow (the nearest day it
 * can show), All for whenever. Typing into Upcoming used to create an undated
 * task that vanished from the view on Enter — the field's one job is not losing
 * what was typed, and "gone" is indistinguishable from "lost".
 */
function captureDefaults(view: TaskView, today: string) {
  if (view === "today") {
    return { dueDate: today, placeholder: "Add a task for today — try “draft report fri p1”" };
  }
  if (view === "upcoming") {
    return {
      dueDate: addLocalDays(today, 1),
      placeholder: "Add a task for tomorrow — try “draft report fri p1”",
    };
  }
  return { dueDate: null, placeholder: undefined };
}

const SORTERS: Record<SortBy, (a: Task, b: Task) => number> = {
  plan: comparePlanned,
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
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);

  const [view, setView] = useState<TaskView>("today");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [sortBy, setSortBy] = useState<SortBy>("plan");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [subtaskParent, setSubtaskParent] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  /** The row a drag is currently over; the insertion line is drawn above it. */
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const phone = useMediaQuery(BELOW_SM);

  const today = todayLocalDate();
  const hasAnyTask = tasks.length > 0;
  const capture = captureDefaults(view, today);

  const sections = useMemo<Section[]>(() => {
    const compare = SORTERS[sortBy];

    // ─── Today ──────────────────────────────────────────────────────────────
    //
    // Undated tasks are deliberately absent. Being undated *is* the statement
    // that a task isn't today's problem; sweeping them in here would make this
    // view identical to All and remove the only reason to open it.
    if (view === "today") {
      const overdue = tasks.filter((t) => t.active && t.dueDate && compareLocalDates(t.dueDate, today) < 0);
      const due = tasks.filter((t) => t.active && t.dueDate === today);
      const doneToday = tasks.filter(
        (t) => !t.active && t.completedAt && t.completedAt.slice(0, 10) === today
      );
      return [
        {
          key: "overdue",
          label: "Overdue",
          tone: "overdue" as const,
          nodes: nest(withSubtasks(overdue, tasks), compare),
        },
        {
          key: "today",
          label: "Due today",
          nodes: nest(withSubtasks(due, tasks), compare),
        },
        {
          key: "done",
          label: "Completed today",
          nodes: nest(withSubtasks(doneToday, tasks), compare),
        },
      ]
        .filter((s) => s.nodes.length > 0)
        .map((s) => ({
          ...s,
          trackedSeconds: s.nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
        }));
    }

    // ─── Upcoming ───────────────────────────────────────────────────────────
    if (view === "upcoming") {
      const horizon = addLocalDays(today, 7);
      const out: Section[] = [];
      for (let i = 0; i <= 7; i++) {
        const day = addLocalDays(today, i);
        const forDay = tasks.filter((t) => t.active && t.dueDate === day);
        if (!forDay.length) continue;
        const nodes = nest(withSubtasks(forDay, tasks), compare);
        out.push({
          key: day,
          label: formatDueHeading(day, today),
          nodes,
          trackedSeconds: nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
        });
      }
      const later = tasks.filter(
        (t) => t.active && t.dueDate && compareLocalDates(t.dueDate, horizon) > 0
      );
      if (later.length) {
        const nodes = nest(withSubtasks(later, tasks), compare);
        out.push({
          key: "later",
          label: "Later",
          nodes,
          trackedSeconds: nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
        });
      }
      return out;
    }

    // ─── All ────────────────────────────────────────────────────────────────
    const filtered = tasks.filter((t) =>
      status === "all" ? true : status === "active" ? t.active : !t.active
    );

    if (groupBy === "none") {
      const nodes = nest(filtered, compare);
      return nodes.length
        ? [
            {
              key: "all",
              label: "All tasks",
              trackedSeconds: nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
              nodes,
              reorderable: sortBy === "plan",
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
      const nodes = nest(b.tasks, compare);
      return {
        key,
        label: b.label,
        color: b.color,
        nodes,
        trackedSeconds: nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
        // Ordering is only the user's own inside a project; in any other
        // grouping a drag would be rewriting a sequence the group doesn't own.
        reorderable: groupBy === "project" && sortBy === "plan",
      };
    });

    // Due groups sort chronologically ("No due date" last); everything else by name.
    return groupBy === "due"
      ? entries.sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.key.localeCompare(b.key)))
      : entries.sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks, view, status, groupBy, sortBy, today]);

  const isEmpty = sections.length === 0;
  const upcomingCount = tasks.filter(
    (t) => t.active && t.dueDate && compareLocalDates(t.dueDate, today) > 0
  ).length;
  const undatedCount = tasks.filter((t) => !t.dueDate).length;

  // Counts are of *top-level* tasks. A subtask has no due date of its own and
  // rides its parent's row, so counting them would make "Today 3" disagree with
  // the three rows underneath it.
  const counts = useMemo(() => {
    const top = tasks.filter((t) => !t.parentId && t.active);
    const overdue = top.filter((t) => t.dueDate && compareLocalDates(t.dueDate, today) < 0).length;
    return {
      overdue,
      today: overdue + top.filter((t) => t.dueDate === today).length,
      upcoming: top.filter((t) => t.dueDate && compareLocalDates(t.dueDate, today) > 0).length,
      all: top.length,
    };
  }, [tasks, today]);

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

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
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
    } else if (view === "today") {
      // Two different nothings. "Nothing due today" over a backlog of dated work
      // is a clear day; over a list where nothing has a due date at all it's a
      // dead end — the view can never fill, and an empty state with no way out
      // reads as a broken page. Both always offer somewhere to go.
      empty = (
        <EmptyState
          icon={CalendarCheck}
          title={undatedCount === tasks.length ? "Nothing is scheduled yet" : "Nothing due today"}
          description={
            undatedCount === tasks.length
              ? `None of your ${tasks.length} task${tasks.length === 1 ? " has" : "s have"} a due date. Give one a date and it shows up here.`
              : upcomingCount > 0
                ? `${upcomingCount} task${upcomingCount === 1 ? "" : "s"} coming up.`
                : "Nothing scheduled ahead either."
          }
          className="py-24"
          action={
            upcomingCount > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setView("upcoming")}>
                See what's upcoming
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setView("all")}>
                Show all tasks
              </Button>
            )
          }
        />
      );
    } else if (view === "upcoming") {
      empty = (
        <EmptyState
          icon={CalendarCheck}
          title="Nothing scheduled"
          description="Tasks with a due date show up here. Everything else lives under All."
          className="py-24"
          action={
            <Button size="sm" variant="outline" onClick={() => setView("all")}>
              Show all tasks
            </Button>
          }
        />
      );
    } else {
      empty = (
        <EmptyState
          icon={SearchX}
          title="No tasks match this filter"
          description={`Showing ${status === "done" ? "done" : "active"} tasks only.`}
          className="py-24"
          action={
            <Button size="sm" variant="outline" onClick={() => setStatus("all")}>
              Clear filter
            </Button>
          }
        />
      );
    }
  }

  const renderNode = (node: TaskNode, ordered: Task[], index: number, section: Section) => {
    const open = !collapsed.has(node.task.id);
    const dragging = dragId === node.task.id;
    // A drop lands *before* this row, so the line is drawn above the row under
    // the pointer — and not above the row being dragged, where it would promise
    // a move to the place it already is.
    const dropTarget = !!dragId && !dragging && dragOverId === node.task.id;
    const dragHandlers = section.reorderable
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
            className="pointer-events-none absolute inset-x-3 -top-[5px] h-0.5 rounded-full bg-foreground"
          />
        )}
        <div
          className={cn(
            // The card wakes its *edge* on hover, like every other row card
            // (The Hairline Rule); the wash inside belongs to the rows it groups.
            "overflow-hidden rounded-container border bg-card transition-[border-color,opacity] duration-fast ease-out-quart hover:border-border-strong",
            dragging && "opacity-50"
          )}
        >
          <TaskRow
            task={node.task}
            showProject={groupBy !== "project" || view !== "all"}
            expanded={open}
            onToggleExpanded={() => toggleCollapsed(node.task.id)}
            onRequestDelete={setDeleteTarget}
            onEdit={setEditTarget}
            onLogTime={(t) => openTaskLogTime(t.id)}
            onAddSubtask={(t) => {
              setCollapsed((prev) => {
                const next = new Set(prev);
                next.delete(t.id);
                return next;
              });
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
                  onRequestDelete={setDeleteTarget}
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
        <TaskViewTabs view={view} counts={counts} onChange={setView} />

        {/* Grouping and status only mean anything in All — Today and Upcoming
            *are* a grouping, and stacking a second one on top reads as two
            controls fighting over the same list.
            The rule separates navigation from filtering: without it the view
            switcher read as a fourth dropdown in a row of four, and the one
            control that changes *what page you are on* looked exactly as
            important as the one that changes the sort. */}
        {view === "all" && (
          <>
              <div className="mx-1 h-5 w-px bg-border" aria-hidden />
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger size="sm" className="w-28" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>

              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <SelectTrigger size="sm" className="w-36" aria-label="Group by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Group: Project</SelectItem>
                  <SelectItem value="due">Group: Due date</SelectItem>
                  <SelectItem value="status">Group: Status</SelectItem>
                  <SelectItem value="none">Group: None</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                {/* w-40: "Sort: Plan order" clipped to "Sort: Plan orde" at the
                    width its two siblings share. */}
                <SelectTrigger size="sm" className="w-40" aria-label="Sort by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plan">Sort: Plan order</SelectItem>
                  <SelectItem value="recent">Sort: Recent</SelectItem>
                  <SelectItem value="name">Sort: Name</SelectItem>
                  <SelectItem value="estimate">Sort: Estimate</SelectItem>
                  <SelectItem value="tracked">Sort: Tracked</SelectItem>
                </SelectContent>
              </Select>
          </>
        )}

        {hasAnyTask && (
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add task
          </Button>
        )}
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
            {hasAnyTask && (
              <QuickAddTask
                className="mb-4"
                defaultDueDate={capture.dueDate}
                placeholder={capture.placeholder}
                // On a phone the inline project picker left the field a third of
                // the row; stacked, the line is the line.
                stacked={phone}
              />
            )}

            {empty ?? (
              <div className="space-y-6">
                {sections.map((section) => {
                  const ordered = section.nodes.map((n) => n.task);
                  return (
                    <div key={section.key}>
                      <div className="mb-1 flex items-center gap-2 px-2">
                        {groupBy === "project" && view === "all" && <ColorDot color={section.color} />}
                        {/* Sentence case at Label weight. Uppercase + tracking on every group
                            heading is the eyebrow pattern PRODUCT.md and DESIGN.md §8 both
                            reject by name; the ColorDot and count already do the work. */}
                        {/* Not tinted, even for the overdue group. Inside that
                            section every row's due date is already red, so the
                            heading made one fact red twice — and a section
                            heading is a heading, not a state indicator. The word
                            "Overdue" carries it. */}
                        <h2 className="text-xs font-medium text-muted-foreground">
                          {section.label}
                        </h2>
                        {/* Full muted ink: at 70% the count measured under 3:1
                            on the ground, and the tabs' counts beside it don't
                            fade. The heading's weight is what ranks them. */}
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {section.nodes.length}
                        </span>
                        {section.trackedSeconds > 0 && (
                          <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                            {formatDurationShort(section.trackedSeconds)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {section.nodes.map((node, i) => renderNode(node, ordered, i, section))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </PaneScroll>

      <TaskDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultDueDate={capture.dueDate}
      />

      <TaskDialog
        open={!!editTarget}
        task={editTarget}
        onClose={() => setEditTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete task?"
        description={
          deleteTarget?.subtaskTotal
            ? `"${deleteTarget.name}" and its ${deleteTarget.subtaskTotal} subtask${
                deleteTarget.subtaskTotal === 1 ? "" : "s"
              } will be permanently deleted. Time already tracked against them is kept.`
            : `"${deleteTarget?.name}" will be permanently deleted. This cannot be undone.`
        }
        onConfirm={() => {
          if (deleteTarget) deleteTask.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </Pane>
  );
}
