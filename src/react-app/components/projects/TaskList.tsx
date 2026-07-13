import { useState } from "react";
import { Plus, Trash2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import { formatSeconds, parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
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

  return (
    <div className="mt-3 space-y-1">
      {tasks.map((task) => {
        const progress = task.estimatedSeconds
          ? Math.min(100, Math.round((task.trackedSeconds / task.estimatedSeconds) * 100))
          : null;

        return (
          <div
            key={task.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
          >
            {/* Done toggle */}
            <button
              onClick={() => handleToggleDone(task)}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
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
                    className="h-5 w-28 py-0 text-[10px]"
                  />
                </div>
              ) : progress !== null ? (
                <button
                  className="mt-0.5 flex w-full items-center gap-1.5 hover:opacity-70 transition-opacity"
                  onClick={() => handleStartEditTime(task)}
                >
                  <Progress value={progress} className="h-1 flex-1" />
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {formatSeconds(task.trackedSeconds)} /{" "}
                    {formatSeconds(task.estimatedSeconds!)}
                  </span>
                </button>
              ) : task.trackedSeconds > 0 ? (
                <button
                  className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:opacity-70 transition-opacity"
                  onClick={() => handleStartEditTime(task)}
                >
                  {formatSeconds(task.trackedSeconds)} tracked · <span className="underline decoration-dashed">add estimate</span>
                </button>
              ) : (
                <button
                  className="mt-0.5 text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors hover:text-muted-foreground!"
                  onClick={() => handleStartEditTime(task)}
                >
                  add estimate
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleStartEdit(task)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:text-destructive"
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
          className="h-7 text-xs"
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={handleCreate}
          disabled={!newName.trim() || createTask.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

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
