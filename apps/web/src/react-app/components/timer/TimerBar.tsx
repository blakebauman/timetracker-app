import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimerControl } from "./TimerControl";
import { FavoritesMenu } from "./FavoritesMenu";
import { ResumeLastButton } from "./ResumeLastButton";
import { DescriptionAutocomplete } from "./DescriptionAutocomplete";
import { DayRibbon } from "./DayRibbon";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { TaskPicker } from "@/components/entries/TaskPicker";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useTimer, useTimerLifecycle, type StartTimerInput } from "@/hooks/useTimer";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateEntry } from "@/hooks/useEntries";
import { useTagColors } from "@/hooks/useProjects";
import { BillableToggle } from "./BillableToggle";
import { getDefaultBillable } from "@/lib/billable";
import { cn } from "@/lib/utils";
import type { EntrySuggestion } from "@timetracker/core/schemas";

/**
 * The timer has two bodies and one mind.
 *
 * Idle, it is the **composer**: a glass capsule floating over the bottom of
 * the pane, asking what you're working on, with the project / task / billable
 * pills beneath and the red Start disc at the right. Running, the capsule
 * docks into the **transport bar**: a full-width strip on the bottom edge
 * carrying the Stop disc and its breathing ring, the elapsed readout at
 * display size, the same editable description and pills, and the day ribbon
 * — today drawn as a trace, with the live segment growing.
 *
 * Everything below the render is unchanged from the top-bar era and is the
 * single source of truth for "what the bar would start": the draft, the sync
 * from the running entry, the debounced description save, and the lifecycle
 * hook that owns the tick loop and the Alt+Shift hotkeys.
 */
export function TimerBar() {
  const { runningEntry } = useTimerStore();
  const { startTimer, stopTimer, discardTimer } = useTimer();
  const updateEntry = useUpdateEntry();
  // Shared with the Alt+Shift+X hotkey (registered in useTimerLifecycle) so
  // both the trash-icon button and the keyboard shortcut open the same
  // confirm dialog.
  const confirmDiscard = useUIStore((s) => s.discardConfirmOpen);
  const setConfirmDiscard = useUIStore((s) => s.setDiscardConfirmOpen);

  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  // Tags carried over from a picked suggestion (or synced from the running
  // entry). The bar has no tag *picker* — chips are removable but only ever
  // added via suggestions/favorites; full editing lives in the entry sheet.
  const [tags, setTags] = useState<string[]>([]);
  // Whether this hour is invoiceable. Seeded from the project on selection,
  // overridable by the user.
  const [billable, setBillable] = useState(getDefaultBillable);
  const tagColor = useTagColors();
  const { data: projects = [] } = useProjects();
  const descRef = useRef<HTMLInputElement>(null);

  const isRunning = Boolean(runningEntry);

  // Sync the editable fields from the running entry whenever it changes
  // (restored from IndexedDB, or started/stopped in another tab). Adjusting
  // during render avoids a frame of stale fields.
  const [syncedEntryId, setSyncedEntryId] = useState<string | null>(
    runningEntry?.id ?? null
  );
  const [syncedProjectId, setSyncedProjectId] = useState<string | null>(
    runningEntry?.projectId ?? null
  );
  const [syncedTaskId, setSyncedTaskId] = useState<string | null>(
    runningEntry?.taskId ?? null
  );
  const tagsKey = (runningEntry?.tags ?? []).join("\0");
  const [syncedTagsKey, setSyncedTagsKey] = useState(tagsKey);
  const [syncedBillable, setSyncedBillable] = useState(
    runningEntry?.billable ?? false
  );
  if (syncedEntryId !== (runningEntry?.id ?? null)) {
    setSyncedEntryId(runningEntry?.id ?? null);
    setSyncedProjectId(runningEntry?.projectId ?? null);
    setSyncedTaskId(runningEntry?.taskId ?? null);
    setSyncedTagsKey(tagsKey);
    setDescription(runningEntry?.description ?? "");
    setProjectId(runningEntry?.projectId ?? null);
    setTaskId(runningEntry?.taskId ?? null);
    setTags(runningEntry?.tags ?? []);
    // On stop (runningEntry → null) the bar resets to the user's preference,
    // not to a hard false.
    setBillable(runningEntry?.billable ?? getDefaultBillable());
  } else if (runningEntry) {
    // Same entry, but its project/task may have been reassigned elsewhere.
    // Description is intentionally not re-synced here to avoid clobbering
    // in-progress typing while the debounced save is in flight.
    if (syncedProjectId !== (runningEntry.projectId ?? null)) {
      setSyncedProjectId(runningEntry.projectId ?? null);
      setProjectId(runningEntry.projectId ?? null);
    }
    if (syncedTaskId !== (runningEntry.taskId ?? null)) {
      setSyncedTaskId(runningEntry.taskId ?? null);
      setTaskId(runningEntry.taskId ?? null);
    }
    if (syncedTagsKey !== tagsKey) {
      setSyncedTagsKey(tagsKey);
      setTags(runningEntry.tags ?? []);
    }
    if (syncedBillable !== runningEntry.billable) {
      setSyncedBillable(runningEntry.billable);
      setBillable(runningEntry.billable);
    }
  }

  // Debounced description update while running. A rejected save is not
  // silent: the bar would otherwise keep showing text the server never stored.
  useEffect(() => {
    if (!runningEntry || description === runningEntry.description) return;
    const t = setTimeout(() => {
      updateEntry.mutate(
        { id: runningEntry.id, data: { description } },
        {
          onError: () =>
            toast.error("Couldn't save the description", {
              description: "It hasn't been stored on this entry yet.",
            }),
        }
      );
    }, 800);
    return () => clearTimeout(t);
  }, [description, runningEntry?.id]);

  // The single definition of "what the bar would start", handed to both the
  // disc below and the Alt+Shift+S hotkey inside `useTimerLifecycle`.
  const draft: StartTimerInput = { description, projectId, taskId, tags, billable };

  // Owns the tick loop, mount-restore, and Alt+Shift+S/X hotkeys — must be
  // called exactly once (TimerBar is always mounted).
  useTimerLifecycle(draft);

  const handleStart = () => startTimer(draft);
  const handleStop = () => stopTimer();
  const handleSubmit = () => {
    if (isRunning) handleStop();
    else handleStart();
  };

  // Picking a suggestion restores the whole combo it was usually logged
  // against, not just the text — including whether last time was invoiceable.
  const handleSuggestion = (s: EntrySuggestion) => {
    setDescription(s.description);
    setProjectId(s.projectId);
    setTaskId(s.taskId);
    setTags(s.tags);
    setBillable(s.billable);
    if (runningEntry) {
      updateEntry.mutate({
        id: runningEntry.id,
        data: {
          description: s.description,
          projectId: s.projectId,
          taskId: s.taskId,
          tags: s.tags,
          billable: s.billable,
        },
      });
    }
    descRef.current?.focus();
  };

  const removeTag = (name: string) => {
    const previous = tags;
    const next = tags.filter((t) => t !== name);
    setTags(next);
    if (runningEntry) {
      updateEntry.mutate(
        { id: runningEntry.id, data: { tags: next } },
        {
          onError: () => {
            setTags(previous);
            toast.error(`Couldn't remove the tag "${name}"`, {
              description: "It's still on this entry. Try again.",
            });
          },
        }
      );
    }
  };

  const handleProjectChange = (id: string | null) => {
    setProjectId(id);
    setTaskId(null);
    // Precedence: an explicit toggle beats the project's flag, which beats the
    // user's "Default billable" preference. Clearing the project falls back to
    // that preference rather than hard false.
    const next = id
      ? (projects.find((p) => p.id === id)?.billable ?? getDefaultBillable())
      : getDefaultBillable();
    setBillable(next);
    if (runningEntry) {
      updateEntry.mutate({
        id: runningEntry.id,
        data: { projectId: id, taskId: null, billable: next },
      });
    }
  };

  const handleTaskChange = (id: string | null) => {
    setTaskId(id);
    if (runningEntry) {
      updateEntry.mutate({ id: runningEntry.id, data: { taskId: id } });
    }
  };

  const handleBillableChange = (next: boolean) => {
    setBillable(next);
    if (runningEntry) {
      updateEntry.mutate({ id: runningEntry.id, data: { billable: next } });
    }
  };

  // The pills under the field. Shared by both bodies so the composer and the
  // bar can't drift — same controls, same order, same accessible names.
  const chipClass =
    "tt-touch h-8 max-w-48 shrink rounded-full border border-border bg-background px-2.5 hover:bg-foreground/6";
  const pills = (
    <>
      <ProjectPicker
        value={projectId}
        onChange={handleProjectChange}
        compact
        className={chipClass}
      />
      <TaskPicker
        projectId={projectId}
        value={taskId}
        onChange={handleTaskChange}
        compact
        className={chipClass}
      />
      {tags.length > 0 && (
        <span className="flex min-w-0 shrink items-center gap-1">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="h-7 gap-1 border-border bg-background pr-1 pl-2 text-xs font-normal"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tagColor(tag) }}
              />
              <span className="max-w-28 truncate">{tag}</span>
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => removeTag(tag)}
                className="rounded-full p-0.5 text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </span>
      )}
      <BillableToggle value={billable} onChange={handleBillableChange} />
    </>
  );

  const descriptionField = (
    <DescriptionAutocomplete
      inputRef={descRef}
      value={description}
      onChange={setDescription}
      onSelect={handleSuggestion}
      onSubmit={handleSubmit}
      className={cn(
        // Bare in both bodies: the capsule or the bar is the field's edge. The
        // inset ring is the only focus signal here, at full opacity, because
        // with `border-0` there is no border to shift colour.
        "tt-touch h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-base shadow-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset md:text-base dark:bg-transparent",
        isRunning && "font-medium"
      )}
    />
  );

  const discardDialog = (
    <ConfirmDialog
      open={confirmDiscard}
      onOpenChange={setConfirmDiscard}
      title="Discard running timer?"
      description="The time tracked so far will be permanently deleted. This cannot be undone."
      confirmLabel="Discard"
      onConfirm={discardTimer}
    />
  );

  if (!isRunning) {
    return (
      <header
        aria-label="Timer controls"
        className="tt-glass fixed inset-x-4 bottom-4 z-dock animate-capsule-in rounded-capsule border border-primary/20 p-3 shadow-2xl transition-[border-color] duration-fast ease-out-quart focus-within:border-primary/40 md:bottom-6 md:left-[calc(5rem+1.5rem)] md:right-auto md:w-[min(46rem,calc(100vw-5rem-3rem))]"
      >
        <div className="flex items-center gap-2">
          {descriptionField}
          <TimerControl isRunning={false} onStart={handleStart} onStop={handleStop} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {pills}
          {/* Resume the last thing tracked, and one-click start from a saved
              preset. Both are idle-only. */}
          <span className="ml-auto flex shrink-0 items-center">
            <ResumeLastButton
              onResume={(s) =>
                startTimer({
                  description: s.description,
                  projectId: s.projectId,
                  taskId: s.taskId,
                  tags: s.tags,
                  billable: s.billable,
                })
              }
            />
            <FavoritesMenu current={{ description, projectId, taskId, tags, billable }} />
          </span>
        </div>
        {discardDialog}
      </header>
    );
  }

  return (
    <header
      aria-label="Timer controls"
      className="tt-glass fixed inset-x-0 bottom-0 z-dock animate-dock-in border-t md:left-20"
    >
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
        <TimerControl isRunning onStart={handleStart} onStop={handleStop} />

        {/* Description + pills. `basis-full` below md: the disc and readout
            take the first row, the field the second, the pills the third —
            and Stop stays on screen at every width. */}
        <div className="flex min-w-0 basis-full flex-col gap-1.5 md:basis-auto md:flex-1">
          {descriptionField}
          <div className="flex flex-wrap items-center gap-1.5 px-1">{pills}</div>
        </div>

        {/* Today as a trace. Only where there is room for it to be read. */}
        <DayRibbon className="hidden w-64 shrink-0 lg:block xl:w-80" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="tt-touch ml-auto shrink-0 text-muted-foreground hover:text-destructive md:ml-0"
              onClick={() => setConfirmDiscard(true)}
              aria-label="Discard timer"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Discard timer
            <span className="ml-1.5 text-background/60">Alt+Shift+X</span>
          </TooltipContent>
        </Tooltip>
      </div>
      {discardDialog}
    </header>
  );
}
