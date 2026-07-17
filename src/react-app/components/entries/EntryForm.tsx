import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
