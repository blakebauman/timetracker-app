import { useState } from "react";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
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
import { useAiQuickEntry } from "@/hooks/useAi";
import { useCreateEntry } from "@/hooks/useEntries";
import type { AiQuickEntryResult } from "@shared/schemas";

interface AiQuickAddDialogProps {
  open: boolean;
  onClose: () => void;
}

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function applyTimeInput(iso: string, timeStr: string): string {
  const d = new Date(iso);
  const [h, m] = timeStr.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function AiQuickAddDialog({ open, onClose }: AiQuickAddDialogProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AiQuickEntryResult | null>(null);

  // Preview/edit state, populated once the AI has parsed the text.
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [billable, setBillable] = useState(false);
  const [startIso, setStartIso] = useState("");
  const [stopBaseIso, setStopBaseIso] = useState("");
  const [startTime, setStartTime] = useState("");
  const [stopTime, setStopTime] = useState("");

  const quickEntry = useAiQuickEntry();
  const createEntry = useCreateEntry();

  const reset = () => {
    setText("");
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleParse = () => {
    if (!text.trim()) return;
    const now = new Date();
    quickEntry.mutate(
      {
        text,
        referenceDate: now.toISOString(),
        timezoneOffsetMinutes: now.getTimezoneOffset(),
      },
      {
        onSuccess: (data) => {
          setResult(data);
          setDescription(data.description);
          setProjectId(data.projectMatched ? data.projectId : null);
          setTaskId(data.taskMatched ? data.taskId : null);
          setTags(data.tags);
          setBillable(data.billable);
          setStartIso(data.start);
          setStopBaseIso(data.stop ?? data.start);
          setStartTime(toTimeInput(data.start));
          setStopTime(data.stop ? toTimeInput(data.stop) : "");
        },
      }
    );
  };

  const handleConfirm = () => {
    createEntry.mutate(
      {
        description,
        projectId,
        taskId,
        tags,
        billable,
        start: applyTimeInput(startIso, startTime),
        stop: stopTime ? applyTimeInput(stopBaseIso, stopTime) : undefined,
      },
      { onSuccess: handleClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI quick add
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Describe what you worked on</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='e.g. "2h on Acme redesign yesterday afternoon"'
                className="min-h-24 resize-none"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                You'll review and confirm the details before anything is saved.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleParse}
                disabled={!text.trim() || quickEntry.isPending}
              >
                {quickEntry.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Parsing…
                  </>
                ) : (
                  "Parse"
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {(result.confidence === "low" || result.warnings.length > 0) && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="space-y-0.5">
                  {result.confidence === "low" && (
                    <p>Low confidence — please double check these values.</p>
                  )}
                  {result.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-20 resize-none"
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
              {result.projectName && !result.projectMatched && (
                <p className="text-xs text-muted-foreground">
                  AI guess: "{result.projectName}" (not matched — pick one above)
                </p>
              )}
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
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label>Stop</Label>
                <Input type="time" value={stopTime} onChange={(e) => setStopTime(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch id="ai-billable" checked={billable} onCheckedChange={setBillable} />
              <Label htmlFor="ai-billable">Billable</Label>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setResult(null)}>
                Back
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={createEntry.isPending}>
                {createEntry.isPending ? "Saving…" : "Confirm & save"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
