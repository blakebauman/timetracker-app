import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { ProjectPicker } from "./ProjectPicker";
import { TaskPicker } from "./TaskPicker";
import { TagPicker } from "./TagPicker";
import { TimeOfDayInput } from "./TimeOfDayInput";
import { useUpdateEntry } from "@/hooks/useEntries";
import { dateDelta, shiftDate, toDateInputValue, formatSeconds, parseTimeInput } from "@/lib/dateUtils";

// Only the fields the form actually reads — so a full TimeEntry OR a report's
// DetailedEntry (both structurally provide these) can be edited.
export interface EditableEntry {
  id: string;
  description: string;
  projectId: string | null;
  taskId: string | null;
  tags: string[];
  billable: boolean;
  start: string;
  stop: string | null;
}

interface EntryFormProps {
  entry: EditableEntry;
  open: boolean;
  onClose: () => void;
}

export function EntryForm({ entry, open, onClose }: EntryFormProps) {
  const [description, setDescription] = useState(entry.description);
  const [projectId, setProjectId] = useState<string | null>(entry.projectId);
  const [taskId, setTaskId] = useState<string | null>(entry.taskId ?? null);
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [billable, setBillable] = useState(entry.billable);
  const [start, setStart] = useState(entry.start);
  const [stop, setStop] = useState<string | null>(entry.stop);
  const updateEntry = useUpdateEntry();

  const computeDurationSeconds = (s: string, e: string | null) =>
    e ? Math.max(0, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 1000)) : 0;

  const [durationText, setDurationText] = useState(() => formatSeconds(computeDurationSeconds(start, stop)));

  // Resync the editable duration text whenever start/stop change from
  // elsewhere (Date field, Start/Stop TimeOfDayInputs) — same "adjust during
  // render" pattern TimeOfDayInput uses, to avoid a frame of stale text.
  const [syncedRange, setSyncedRange] = useState({ start, stop });
  if (syncedRange.start !== start || syncedRange.stop !== stop) {
    setSyncedRange({ start, stop });
    setDurationText(formatSeconds(computeDurationSeconds(start, stop)));
  }

  // Editing duration keeps `start` fixed and moves `stop` — same convention
  // as EntryRow's and TimesheetView's inline duration edit.
  const commitDuration = () => {
    const parsed = parseTimeInput(durationText);
    if (parsed !== null && parsed >= 0 && stop !== null) {
      setStop(new Date(new Date(start).getTime() + parsed * 1000).toISOString());
    } else {
      setDurationText(formatSeconds(computeDurationSeconds(start, stop)));
    }
  };

  // Moves both start and stop to the new calendar date, preserving each's
  // time-of-day (and so the entry's duration and any overnight span). The
  // delta is computed once from `start` — the field the "Date" label
  // represents — and applied to both; computing it separately per field
  // would drift for an overnight entry, since start and stop can sit on
  // different local calendar days to begin with.
  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    const deltaDays = dateDelta(start, newDate);
    setStart((prev) => shiftDate(prev, deltaDays));
    setStop((prev) => (prev ? shiftDate(prev, deltaDays) : prev));
  };

  const handleSave = () => {
    updateEntry.mutate(
      {
        id: entry.id,
        data: {
          description,
          projectId,
          taskId,
          tags,
          billable,
          start,
          stop: stop ?? undefined,
        },
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Edit Time Entry</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What were you working on?"
              className="min-h-20 resize-none"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker
              value={projectId}
              onChange={(id) => { setProjectId(id); setTaskId(null); }}
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
            <Input
              type="date"
              value={toDateInputValue(start)}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Start</Label>
              <TimeOfDayInput value={start} fallbackIso={entry.start} onChange={(iso) => setStart(iso ?? start)} />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Stop</Label>
              <TimeOfDayInput
                value={stop}
                fallbackIso={stop ?? entry.start}
                onChange={setStop}
                allowClear
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Duration</Label>
              <Input
                value={durationText}
                onChange={(e) => setDurationText(e.target.value)}
                onBlur={commitDuration}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitDuration();
                    e.currentTarget.blur();
                  }
                }}
                disabled={stop === null}
                placeholder={stop === null ? "—" : undefined}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="billable" checked={billable} onCheckedChange={setBillable} />
            <Label htmlFor="billable">Billable</Label>
          </div>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateEntry.isPending}>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
