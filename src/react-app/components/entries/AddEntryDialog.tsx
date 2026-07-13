import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ProjectPicker } from "./ProjectPicker";
import { TaskPicker } from "./TaskPicker";
import { TagPicker } from "./TagPicker";
import { useCreateEntry } from "@/hooks/useEntries";
import { formatDurationShort } from "@/lib/dateUtils";

interface AddEntryDialogProps {
  open: boolean;
  onClose: () => void;
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

export function AddEntryDialog({ open, onClose }: AddEntryDialogProps) {
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [billable, setBillable] = useState(false);
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [startTime, setStartTime] = useState("");
  const [stopTime, setStopTime] = useState("");

  const createEntry = useCreateEntry();

  const reset = () => {
    setDescription("");
    setProjectId(null);
    setTaskId(null);
    setTags([]);
    setBillable(false);
    setDate(toDateInput(new Date()));
    setStartTime("");
    setStopTime("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const start = toIso(date, startTime);
  const stop = toIso(date, stopTime);
  const durationSeconds =
    start && stop ? Math.round((new Date(stop).getTime() - new Date(start).getTime()) / 1000) : null;
  const hasValidRange = durationSeconds !== null && durationSeconds > 0;

  const handleSave = () => {
    if (!start || !stop || !hasValidRange) return;
    createEntry.mutate(
      { description, projectId, taskId, tags, billable, start, stop },
      { onSuccess: handleClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add entry
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              className="min-h-20 resize-none"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker
              value={projectId}
              onChange={(id) => {
                setProjectId(id);
                setTaskId(null);
              }}
            />
          </div>

          {projectId && (
            <div className="space-y-1.5">
              <Label>Task</Label>
              <TaskPicker projectId={projectId} value={taskId} onChange={setTaskId} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <TagPicker value={tags} onChange={setTags} />
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Stop</Label>
              <Input type="time" value={stopTime} onChange={(e) => setStopTime(e.target.value)} />
            </div>
          </div>

          {startTime && stopTime && !hasValidRange && (
            <p className="text-xs text-destructive">Stop time must be after start time.</p>
          )}
          {hasValidRange && (
            <p className="text-xs text-muted-foreground">
              Duration: {formatDurationShort(durationSeconds!)}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Switch id="add-entry-billable" checked={billable} onCheckedChange={setBillable} />
            <Label htmlFor="add-entry-billable">Billable</Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!hasValidRange || createEntry.isPending}>
            {createEntry.isPending ? "Saving…" : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
