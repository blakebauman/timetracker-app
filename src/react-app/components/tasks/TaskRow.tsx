import { useState } from "react";
import { Trash2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ProjectBadge } from "@/components/ProjectBadge";
import { useUpdateTask } from "@/hooks/useTasks";
import { formatDurationShort, parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import type { Task } from "@shared/schemas";

interface TaskRowProps {
  task: Task;
  /** Show the project pill on the row (hidden when the list is grouped by project). */
  showProject?: boolean;
  onRequestDelete: (task: Task) => void;
}

// Self-contained task row: done toggle, inline-edit name, click-to-edit estimate
// with a tracked/estimate progress bar. Mirrors the in-project TaskList row but
// owns its own edit state so it can be dropped into the standalone Tasks page.
export function TaskRow({ task, showProject = true, onRequestDelete }: TaskRowProps) {
  const updateTask = useUpdateTask();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(task.name);
  const [editingTime, setEditingTime] = useState(false);
  const [estimate, setEstimate] = useState("");

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== task.name) updateTask.mutate({ id: task.id, data: { name: trimmed } });
    else setName(task.name);
    setEditingName(false);
  };

  const startEditTime = () => {
    setEstimate(formatTimeInput(task.estimatedSeconds));
    setEditingTime(true);
  };

  const saveEstimate = () => {
    const trimmed = estimate.trim();
    if (trimmed === "") {
      updateTask.mutate({ id: task.id, data: { estimatedSeconds: null } });
    } else {
      const parsed = parseTimeInput(trimmed);
      if (parsed !== null) updateTask.mutate({ id: task.id, data: { estimatedSeconds: parsed } });
    }
    setEditingTime(false);
  };

  const progress = task.estimatedSeconds
    ? Math.min(100, Math.round((task.trackedSeconds / task.estimatedSeconds) * 100))
    : null;

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50">
      {/* Done toggle */}
      <button
        onClick={() => updateTask.mutate({ id: task.id, data: { active: !task.active } })}
        aria-label={task.active ? "Mark task done" : "Mark task not done"}
        aria-pressed={!task.active}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          !task.active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary"
        }`}
      >
        {!task.active && <Check className="h-2.5 w-2.5" />}
      </button>

      {/* Name / edit + estimate */}
      <div className="min-w-0 flex-1">
        {editingName ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setName(task.name);
                setEditingName(false);
              }
            }}
            className="h-6 py-0 text-sm"
          />
        ) : (
          <span
            className={`text-sm ${!task.active ? "text-muted-foreground line-through" : ""}`}
          >
            {task.name}
          </span>
        )}

        {editingTime ? (
          <div className="mt-0.5">
            <Input
              autoFocus
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              onBlur={saveEstimate}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEstimate();
                if (e.key === "Escape") setEditingTime(false);
              }}
              placeholder="e.g. 1h 30m"
              title="Estimated time — e.g. 1h 30m, 1:30, 90m"
              className="h-5 w-28 py-0 text-[10px]"
            />
          </div>
        ) : progress !== null ? (
          <button
            className="mt-0.5 flex w-full max-w-xs items-center gap-1.5 transition-opacity hover:opacity-70"
            onClick={startEditTime}
          >
            <Progress value={progress} className="h-1 flex-1" />
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {formatDurationShort(task.trackedSeconds)} / {formatDurationShort(task.estimatedSeconds!)}
            </span>
          </button>
        ) : task.trackedSeconds > 0 ? (
          <button
            className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground transition-opacity hover:opacity-70"
            onClick={startEditTime}
          >
            {formatDurationShort(task.trackedSeconds)} tracked ·{" "}
            <span className="underline decoration-dashed">add estimate</span>
          </button>
        ) : (
          <button
            className="mt-0.5 text-[10px] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/50 hover:text-muted-foreground!"
            onClick={startEditTime}
          >
            add estimate
          </button>
        )}
      </div>

      {showProject && task.projectName && (
        <ProjectBadge name={task.projectName} color={task.projectColor} />
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="Edit task"
          onClick={() => {
            setName(task.name);
            setEditingName(true);
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:text-destructive"
          aria-label="Delete task"
          onClick={() => onRequestDelete(task)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
