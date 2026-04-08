import { useState } from "react";
import { Plus, Trash2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [editEstimated, setEditEstimated] = useState("");

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createTask.mutate({ name, projectId }, { onSuccess: () => setNewName("") });
  };

  const handleStartEdit = (task: Task) => {
    setEditingId(task.id);
    setEditName(task.name);
    setEditEstimated(formatTimeInput(task.estimatedSeconds));
  };

  const handleSaveEdit = (id: string) => {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    const trimmed = editEstimated.trim();
    const data: Parameters<typeof updateTask.mutate>[0]["data"] = { name };
    if (trimmed === "") {
      data.estimatedSeconds = null;
    } else {
      const parsed = parseTimeInput(trimmed);
      if (parsed !== null) data.estimatedSeconds = parsed;
    }
    updateTask.mutate({ id, data });
    setEditingId(null);
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
                // onBlur on the container so tabbing between the two inputs doesn't save prematurely
                <div
                  className="flex items-center gap-1.5"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      handleSaveEdit(task.id);
                    }
                  }}
                >
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(task.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-6 min-w-0 flex-1 py-0 text-xs"
                  />
                  <Input
                    value={editEstimated}
                    onChange={(e) => setEditEstimated(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(task.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    placeholder="est. time"
                    title="Estimated time — e.g. 1h 30m, 1:30, 90m"
                    className="h-6 w-20 shrink-0 py-0 text-xs"
                  />
                </div>
              ) : (
                <div>
                  <span
                    className={`text-xs ${!task.active ? "text-muted-foreground line-through" : ""}`}
                  >
                    {task.name}
                  </span>
                  {progress !== null && (
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Progress value={progress} className="h-1 flex-1" />
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {formatSeconds(task.trackedSeconds)} /{" "}
                        {formatSeconds(task.estimatedSeconds!)}
                      </span>
                    </div>
                  )}
                  {!progress && task.trackedSeconds > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatSeconds(task.trackedSeconds)} tracked
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
                onClick={() => deleteTask.mutate(task.id)}
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
    </div>
  );
}
