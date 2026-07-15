import { useMemo, useState } from "react";
import { Plus, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ColorDot } from "@/components/ColorDot";
import { TaskRow } from "./TaskRow";
import { AddTaskDialog } from "./AddTaskDialog";
import { useAllTasks, useDeleteTask } from "@/hooks/useTasks";
import { formatDurationShort } from "@/lib/dateUtils";
import type { Task } from "@shared/schemas";

type StatusFilter = "all" | "active" | "done";
type GroupBy = "project" | "status" | "none";
type SortBy = "name" | "estimate" | "tracked" | "recent";

interface Section {
  key: string;
  label: string;
  color?: string | null;
  trackedSeconds: number;
  tasks: Task[];
}

const SORTERS: Record<SortBy, (a: Task, b: Task) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  estimate: (a, b) => (b.estimatedSeconds ?? 0) - (a.estimatedSeconds ?? 0),
  tracked: (a, b) => b.trackedSeconds - a.trackedSeconds,
  recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
};

export function TaskBoardList() {
  const { data: tasks = [], isLoading } = useAllTasks();
  const deleteTask = useDeleteTask();

  const [status, setStatus] = useState<StatusFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const sections = useMemo<Section[]>(() => {
    const filtered = tasks.filter((t) =>
      status === "all" ? true : status === "active" ? t.active : !t.active
    );
    const sorted = [...filtered].sort(SORTERS[sortBy]);

    if (groupBy === "none") {
      return sorted.length
        ? [
            {
              key: "all",
              label: "All tasks",
              trackedSeconds: sorted.reduce((s, t) => s + t.trackedSeconds, 0),
              tasks: sorted,
            },
          ]
        : [];
    }

    const map = new Map<string, Section>();
    for (const t of sorted) {
      const key = groupBy === "project" ? (t.projectId ?? "none") : t.active ? "active" : "done";
      const label =
        groupBy === "project"
          ? (t.projectName ?? "No project")
          : t.active
            ? "Active"
            : "Done";
      let section = map.get(key);
      if (!section) {
        section = {
          key,
          label,
          color: groupBy === "project" ? t.projectColor : null,
          trackedSeconds: 0,
          tasks: [],
        };
        map.set(key, section);
      }
      section.tasks.push(t);
      section.trackedSeconds += t.trackedSeconds;
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks, status, groupBy, sortBy]);

  const isEmpty = sections.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <h1 className="text-sm font-semibold">Tasks</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-28 text-xs" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>

          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Group by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Group: Project</SelectItem>
              <SelectItem value="status">Group: Status</SelectItem>
              <SelectItem value="none">Group: None</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Sort: Recent</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="estimate">Sort: Estimate</SelectItem>
              <SelectItem value="tracked">Sort: Tracked</SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" className="h-8 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={ListChecks}
          title="What do you plan to work on?"
          description="Create a task to start planning your projects."
          className="py-24"
          action={
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Create a task
            </Button>
          }
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 p-4">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="mb-1 flex items-center gap-2 px-2">
                  {groupBy === "project" && <ColorDot color={section.color} />}
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.label}
                  </h2>
                  <span className="text-xs text-muted-foreground/70">
                    {section.tasks.length}
                  </span>
                  {section.trackedSeconds > 0 && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {formatDurationShort(section.trackedSeconds)}
                    </span>
                  )}
                </div>
                <div className="divide-y rounded-md border">
                  {section.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      showProject={groupBy !== "project"}
                      onRequestDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddTaskDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete task?"
        description={`"${deleteTarget?.name}" will be permanently deleted. This cannot be undone.`}
        onConfirm={() => {
          if (deleteTarget) deleteTask.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
