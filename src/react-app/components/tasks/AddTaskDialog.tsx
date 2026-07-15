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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { useCreateTask } from "@/hooks/useTasks";
import { parseTimeInput } from "@/lib/dateUtils";

interface AddTaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-select this project (e.g. when adding within a project group). */
  defaultProjectId?: string | null;
}

export function AddTaskDialog({ open, onClose, defaultProjectId = null }: AddTaskDialogProps) {
  const createTask = useCreateTask();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [estimate, setEstimate] = useState("");

  const reset = () => {
    setName("");
    setProjectId(defaultProjectId);
    setEstimate("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canSubmit = name.trim().length > 0 && !!projectId && !createTask.isPending;

  const handleSubmit = () => {
    if (!projectId || !name.trim()) return;
    const parsed = estimate.trim() ? parseTimeInput(estimate.trim()) : null;
    createTask.mutate(
      { name: name.trim(), projectId, estimatedSeconds: parsed },
      { onSuccess: handleClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Tasks belong to a project. Add an optional time estimate to track progress.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-name">Name</Label>
            <Input
              id="task-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
              placeholder="What needs doing?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Project</Label>
            <div>
              <ProjectPicker
                value={projectId}
                onChange={setProjectId}
                className="border"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-estimate">Estimate (optional)</Label>
            <Input
              id="task-estimate"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
              placeholder="e.g. 1h 30m, 1:30, 90m"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
