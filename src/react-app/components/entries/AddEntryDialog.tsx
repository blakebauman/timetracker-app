import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
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
import { TimeOfDayInput } from "./TimeOfDayInput";
import { useCreateEntry } from "@/hooks/useEntries";
import { formatDurationShort, dateDelta, shiftDate, toDateInputValue } from "@/lib/dateUtils";

interface AddEntryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddEntryDialog({ open, onClose }: AddEntryDialogProps) {
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [billable, setBillable] = useState(false);
  const [date, setDate] = useState(() => new Date());
  const [start, setStart] = useState<string | null>(null);
  const [stop, setStop] = useState<string | null>(null);

  const createEntry = useCreateEntry();

  // Anchor for Start/Stop's own calendar date before either has a value yet —
  // noon avoids any DST-transition edge case at midnight.
  const fallbackIso = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12
  ).toISOString();

  const reset = () => {
    setDescription("");
    setProjectId(null);
    setTaskId(null);
    setTags([]);
    setBillable(false);
    setDate(new Date());
    setStart(null);
    setStop(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Moves both Start and Stop (if already set) to the new date, preserving
  // their time-of-day — same convention as EntryForm's Date field.
  const handleDateSelect = (newDate: Date) => {
    const deltaDays = dateDelta(date.toISOString(), toDateInputValue(newDate));
    setDate(newDate);
    setStart((s) => (s ? shiftDate(s, deltaDays) : s));
    setStop((s) => (s ? shiftDate(s, deltaDays) : s));
  };

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
            <DatePicker value={date} onSelect={handleDateSelect} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Start</Label>
              <TimeOfDayInput value={start} fallbackIso={fallbackIso} onChange={setStart} allowClear ariaLabel="Start time" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Stop</Label>
              <TimeOfDayInput value={stop} fallbackIso={stop ?? fallbackIso} onChange={setStop} allowClear ariaLabel="Stop time" />
            </div>
          </div>

          {start && stop && !hasValidRange && (
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
