import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { TagPicker } from "./TagPicker";
import { useUpdateEntry } from "@/hooks/useEntries";
import type { TimeEntry } from "@shared/schemas";

interface EntryFormProps {
  entry: TimeEntry;
  open: boolean;
  onClose: () => void;
}

function toTimeInput(iso: string): string {
  return iso.slice(11, 16); // "HH:MM"
}

function applyTimeInput(iso: string, timeStr: string): string {
  return iso.slice(0, 11) + timeStr + ":00.000Z";
}

export function EntryForm({ entry, open, onClose }: EntryFormProps) {
  const [description, setDescription] = useState(entry.description);
  const [projectId, setProjectId] = useState<string | null>(entry.projectId);
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [billable, setBillable] = useState(entry.billable);
  const [startTime, setStartTime] = useState(toTimeInput(entry.start));
  const [stopTime, setStopTime] = useState(
    entry.stop ? toTimeInput(entry.stop) : ""
  );
  const updateEntry = useUpdateEntry();

  const handleSave = () => {
    updateEntry.mutate(
      {
        id: entry.id,
        data: {
          description,
          projectId,
          tags,
          billable,
          start: applyTimeInput(entry.start, startTime),
          stop: stopTime
            ? applyTimeInput(entry.stop ?? entry.start, stopTime)
            : undefined,
        },
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Time Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What were you working on?"
              autoFocus
            />
          </div>

          {/* Project */}
          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker value={projectId} onChange={setProjectId} />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <TagPicker value={tags} onChange={setTags} />
          </div>

          {/* Time range */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Start</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Stop</Label>
              <Input
                type="time"
                value={stopTime}
                onChange={(e) => setStopTime(e.target.value)}
              />
            </div>
          </div>

          {/* Billable */}
          <div className="flex items-center gap-3">
            <Switch
              id="billable"
              checked={billable}
              onCheckedChange={setBillable}
            />
            <Label htmlFor="billable">Billable</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateEntry.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
