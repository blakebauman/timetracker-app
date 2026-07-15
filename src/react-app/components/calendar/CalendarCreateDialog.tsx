import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { TaskPicker } from "@/components/entries/TaskPicker";
import { TagPicker } from "@/components/entries/TagPicker";
import { TimeOfDayInput } from "@/components/entries/TimeOfDayInput";
import { useCreateEntry } from "@/hooks/useEntries";
import { formatDurationShort, formatFullDate } from "@/lib/dateUtils";

interface CalendarCreateDialogProps {
  open: boolean;
  // Prefilled from the dragged grid selection (ISO strings).
  startIso: string;
  stopIso: string;
  // When confirming a Google Calendar "ghost": seed the description and stamp the
  // entry with the external event id so the ghost stops reappearing.
  description?: string;
  calendarEventId?: string;
  onClose: () => void;
}

export function CalendarCreateDialog({
  open,
  startIso,
  stopIso,
  description: prefillDescription,
  calendarEventId,
  onClose,
}: CalendarCreateDialogProps) {
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [billable, setBillable] = useState(false);
  const [start, setStart] = useState(startIso);
  const [stop, setStop] = useState(stopIso);

  const createEntry = useCreateEntry();
  const fromCalendar = Boolean(calendarEventId);

  // Reset local state to the (possibly new) selection each time the dialog opens.
  const openKey = `${startIso}|${stopIso}|${calendarEventId ?? ""}`;
  const [syncedKey, setSyncedKey] = useState(openKey);
  if (open && syncedKey !== openKey) {
    setSyncedKey(openKey);
    setStart(startIso);
    setStop(stopIso);
    setDescription(prefillDescription ?? "");
    setProjectId(null);
    setTaskId(null);
    setTags([]);
    setBillable(false);
  }

  const durationSeconds = Math.round(
    (new Date(stop).getTime() - new Date(start).getTime()) / 1000
  );
  const hasValidRange = durationSeconds > 0;

  const handleSave = () => {
    if (!hasValidRange) return;
    createEntry.mutate(
      { description, projectId, taskId, tags, billable, start, stop, calendarEventId },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" />
            {fromCalendar ? "Track calendar event" : "New entry"}
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
            <Label className="text-muted-foreground">{formatFullDate(start)}</Label>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label>Start</Label>
                <TimeOfDayInput
                  value={start}
                  fallbackIso={startIso}
                  onChange={(iso) => setStart(iso ?? start)}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label>Stop</Label>
                <TimeOfDayInput
                  value={stop}
                  fallbackIso={stopIso}
                  onChange={(iso) => setStop(iso ?? stop)}
                />
              </div>
            </div>
          </div>

          {!hasValidRange ? (
            <p className="text-xs text-destructive">Stop time must be after start time.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Duration: {formatDurationShort(durationSeconds)}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Switch id="cal-billable" checked={billable} onCheckedChange={setBillable} />
            <Label htmlFor="cal-billable">Billable</Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasValidRange || createEntry.isPending}
          >
            {createEntry.isPending ? "Saving…" : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
