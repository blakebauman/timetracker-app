import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { TaskPicker } from "@/components/entries/TaskPicker";
import { TagPicker } from "@/components/entries/TagPicker";
import { cn } from "@/lib/utils";
import { useCreateRecurring, useUpdateRecurring } from "@/hooks/useRecurring";
import {
  localScheduleToUtc,
  utcScheduleToLocal,
  minutesToHHMM,
  hhmmToMinutes,
  dayLabel,
} from "@/lib/recurrence";
import type { RecurringEntry } from "@shared/schemas";

interface RecurringEntryDialogProps {
  open: boolean;
  onClose: () => void;
  editing?: RecurringEntry | null;
}

// Local weekday order shown Mon → Sun (indices 1..6,0).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function RecurringEntryDialog({ open, onClose, editing }: RecurringEntryDialogProps) {
  const create = useCreateRecurring();
  const update = useUpdateRecurring();

  // Prefill from the editing template (converting its stored UTC schedule to local).
  const initial = editing
    ? utcScheduleToLocal(editing.daysOfWeek, editing.timeUtcMinutes)
    : null;

  const [description, setDescription] = useState(editing?.description ?? "");
  const [projectId, setProjectId] = useState<string | null>(editing?.projectId ?? null);
  const [taskId, setTaskId] = useState<string | null>(editing?.taskId ?? null);
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
  const [billable, setBillable] = useState(editing?.billable ?? false);
  const [durationMin, setDurationMin] = useState(
    editing ? Math.round(editing.durationSeconds / 60) : 30
  );
  const [days, setDays] = useState<number[]>(initial?.days ?? [1, 2, 3, 4, 5]);
  const [time, setTime] = useState(minutesToHHMM(initial?.minutes ?? 9 * 60));

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const valid = days.length > 0 && durationMin >= 1;

  const submit = () => {
    if (!valid) return;
    const { daysOfWeek, timeUtcMinutes } = localScheduleToUtc(days, hhmmToMinutes(time));
    const payload = {
      description,
      projectId,
      taskId,
      tags,
      billable,
      durationSeconds: durationMin * 60,
      daysOfWeek,
      timeUtcMinutes,
    };
    if (editing) {
      update.mutate({ id: editing.id, data: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit recurring entry" : "New recurring entry"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rec-desc">Description</Label>
            <Input
              id="rec-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Daily standup"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ProjectPicker
              value={projectId}
              onChange={(id) => {
                setProjectId(id);
                setTaskId(null);
              }}
            />
            <TaskPicker projectId={projectId} value={taskId} onChange={setTaskId} />
            <TagPicker value={tags} onChange={setTags} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rec-dur">Duration (minutes)</Label>
              <Input
                id="rec-dur"
                type="number"
                min={1}
                max={1440}
                value={durationMin}
                onChange={(e) => setDurationMin(Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-time">Time of day</Label>
              <Input
                id="rec-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Repeat on</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(d)}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    "h-8 w-11 rounded-md border text-xs font-medium transition-colors",
                    days.includes(d)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {dayLabel(d)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="rec-billable">Billable</Label>
              <p className="mt-1 text-xs leading-normal text-muted-foreground">
                Mark each generated entry as billable.
              </p>
            </div>
            <Switch id="rec-billable" checked={billable} onCheckedChange={setBillable} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || create.isPending || update.isPending}>
            {editing ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
