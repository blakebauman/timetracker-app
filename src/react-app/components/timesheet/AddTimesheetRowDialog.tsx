import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { TaskPicker } from "@/components/entries/TaskPicker";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";

export interface TimesheetRow {
  key: string;
  projectId: string | null;
  taskId: string | null;
  projectName: string | null;
  projectColor: string | null;
  taskName: string | null;
}

interface AddTimesheetRowDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (row: TimesheetRow) => void;
}

// Adds an empty project/task row to the timesheet so time can be entered for a
// combo that has no entries yet this week.
export function AddTimesheetRowDialog({ open, onClose, onAdd }: AddTimesheetRowDialogProps) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const { data: projects = [] } = useProjects();
  const { data: tasks = [] } = useTasks(projectId ?? undefined);

  const reset = () => {
    setProjectId(null);
    setTaskId(null);
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAdd = () => {
    const project = projects.find((p) => p.id === projectId);
    const task = tasks.find((t) => t.id === taskId);
    onAdd({
      key: `${projectId ?? ""}__${taskId ?? ""}`,
      projectId,
      taskId,
      projectName: project?.name ?? null,
      projectColor: project?.color ?? null,
      taskName: task?.name ?? null,
    });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add timesheet row</DialogTitle>
          <DialogDescription>
            Pick a project (and optional task) to add an empty row you can fill in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <div>
              <ProjectPicker
                value={projectId}
                onChange={(id) => {
                  setProjectId(id);
                  setTaskId(null);
                }}
                className="border"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Task (optional)</Label>
            <div>
              <TaskPicker projectId={projectId} value={taskId} onChange={setTaskId} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd}>Add row</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
