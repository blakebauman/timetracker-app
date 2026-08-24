import { useState } from "react";
import { Plus, Trash2, Check, Pencil, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import { LogTaskTimeSheet } from "@/components/tasks/LogTaskTimeSheet";
import { formatDurationShort, parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import type { Task } from "@shared/schemas";

interface TaskListProps {
  projectId: string;
}

export function TaskList({ projectId }: TaskListProps) {
  const { data: tasks = [], isLoading } = useTasks(projectId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editEstimated, setEditEstimated] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [logTarget, setLogTarget] = useState<Task | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createTask.mutate({ name, projectId }, { onSuccess: () => setNewName("") });
  };

  const handleStartEdit = (task: Task) => {
    setEditingId(task.id);
    setEditName(task.name);
  };

  const handleSaveEdit = (id: string) => {
    const name = editName.trim();
    if (name) updateTask.mutate({ id, data: { name } });
    setEditingId(null);
  };

  const handleStartEditTime = (task: Task) => {
    setEditingTimeId(task.id);
    setEditEstimated(formatTimeInput(task.estimatedSeconds));
  };

  const handleSaveEstimated = (id: string) => {
    const trimmed = editEstimated.trim();
    if (trimmed === "") {
      updateTask.mutate({ id, data: { estimatedSeconds: null } });
    } else {
      const parsed = parseTimeInput(trimmed);
      if (parsed !== null) updateTask.mutate({ id, data: { estimatedSeconds: parsed } });
    }
    setEditingTimeId(null);
  };

  const handleToggleDone = (task: Task) => {
    updateTask.mutate({ id: task.id, data: { active: !task.active } });
  };

  if (isLoading) {
    return (
      <div className="space-y-1.5 pt-2">
        {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  // Done tasks are fetched here too (they weren't before), and this list has no
  // status filter of its own — so sink them below the active ones rather than
  // letting a long-lived project bury its open work under finished work.
  const ordered = [...tasks].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
  );

  return (
    <div className="mt-3 space-y-1">
      {ordered.map((task) => {
        const progress = task.estimatedSeconds
          ? Math.min(100, Math.round((task.trackedSeconds / task.estimatedSeconds) * 100))
          : null;

        return (
          <div
            key={task.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-fast ease-out-quart hover:bg-muted/50"
          >
            {/* Done toggle */}
            <button
              onClick={() => handleToggleDone(task)}
              aria-label={task.active ? "Mark task done" : "Mark task not done"}
              aria-pressed={!task.active}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-fast ease-out-quart ${
                !task.active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/40 hover:border-primary"
              }`}
            >
              {!task.active && <Check className="h-2.5 w-2.5" />}
            </button>

            {/* Name / edit */}
            <div className="min-w-0 flex-1">
              {editingId === task.id ? (
                <Input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleSaveEdit(task.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit(task.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-6 py-0 text-xs"
                />
              ) : (
                <span
                  className={`text-xs ${!task.active ? "text-muted-foreground line-through" : ""}`}
                >
                  {task.name}
                </span>
              )}

              {/* Estimated / tracked time — click to edit estimate */}
              {editingTimeId === task.id ? (
                <div className="mt-0.5">
                  <Input
                    autoFocus
                    value={editEstimated}
                    onChange={(e) => setEditEstimated(e.target.value)}
                    onBlur={() => handleSaveEstimated(task.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEstimated(task.id);
                      if (e.key === "Escape") setEditingTimeId(null);
                    }}
                    placeholder="e.g. 1h 30m"
                    title="Estimated time — e.g. 1h 30m, 1:30, 90m"
                    className="h-5 w-28 py-0 text-micro"
                  />
                </div>
              ) : progress !== null ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="mt-0.5 flex w-full items-center gap-1.5 hover:opacity-70 transition-opacity duration-fast ease-out-quart"
                      onClick={() => handleStartEditTime(task)}
                    >
                      <Progress value={progress} className="h-1 flex-1" aria-hidden />
                      <span className="text-micro tabular-nums text-muted-foreground">
                        {formatDurationShort(task.trackedSeconds)} /{" "}
                        {formatDurationShort(task.estimatedSeconds!)}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Edit estimate — {Math.round(progress)}% used</TooltipContent>
                </Tooltip>
              ) : task.trackedSeconds > 0 ? (
                <button
                  // gap-1.5 so the dashed underline isn't flush against the "·".
                  className="mt-0.5 flex items-center gap-1.5 text-micro text-muted-foreground hover:opacity-70 transition-opacity duration-fast ease-out-quart"
                  onClick={() => handleStartEditTime(task)}
                >
                  <span>{formatDurationShort(task.trackedSeconds)} tracked ·</span>
                  <span className="underline decoration-dashed">add estimate</span>
                </button>
              ) : (
                <button
                  // `block`: a bare <button> is inline-block and ran onto the task
                  // name's line. The other two states are flex and drop below.
                  className="mt-0.5 block text-micro text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors duration-fast ease-out-quart hover:text-muted-foreground!"
                  onClick={() => handleStartEditTime(task)}
                >
                  add estimate
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="tt-reveal flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Log time to ${task.name}`}
                title="Log time to this task"
                onClick={() => setLogTarget(task)}
              >
                <Clock className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Edit task"
                onClick={() => handleStartEdit(task)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="hover:text-destructive"
                aria-label="Delete task"
                onClick={() => setDeleteTarget(task)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}

      {/* Add task input */}
      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Add a task…"
          aria-label="Add a task"
          className="h-7 text-xs"
        />
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          aria-label="Add task"
          onClick={handleCreate}
          disabled={!newName.trim() || createTask.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <LogTaskTimeSheet
        task={logTarget}
        open={!!logTarget}
        onClose={() => setLogTarget(null)}
      />

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
