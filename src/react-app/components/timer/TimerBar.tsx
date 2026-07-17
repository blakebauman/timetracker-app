import { useState, useRef, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimerControl } from "./TimerControl";
import { FavoritesMenu } from "./FavoritesMenu";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { TaskPicker } from "@/components/entries/TaskPicker";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useTimer, useTimerLifecycle } from "@/hooks/useTimer";
import { useUpdateEntry } from "@/hooks/useEntries";
import { cn } from "@/lib/utils";

export function TimerBar() {
  const { runningEntry } = useTimerStore();
  const { startTimer, stopTimer, discardTimer } = useTimer();
  // Owns the tick loop, mount-restore, and Alt+Shift+S/X hotkeys — must be
  // called exactly once (TimerBar is always mounted), not from every
  // component that just needs the action functions above.
  useTimerLifecycle();
  const updateEntry = useUpdateEntry();
  // Shared with the Alt+Shift+X hotkey (registered in useTimerLifecycle) so
  // both the trash-icon button and the keyboard shortcut open the same
  // confirm dialog.
  const confirmDiscard = useUIStore((s) => s.discardConfirmOpen);
  const setConfirmDiscard = useUIStore((s) => s.setDiscardConfirmOpen);

  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const descRef = useRef<HTMLInputElement>(null);

  const isRunning = Boolean(runningEntry);

  // Sync the editable fields from the running entry whenever it changes
  // (restored from IndexedDB, or started/stopped in another tab). Adjusting
  // during render avoids a frame of stale fields. The task is cleared on user
  // project changes by the ProjectPicker handler below, so restoring the
  // entry's own task here is safe and correct.
  const [syncedEntryId, setSyncedEntryId] = useState<string | null>(
    runningEntry?.id ?? null
  );
  const [syncedProjectId, setSyncedProjectId] = useState<string | null>(
    runningEntry?.projectId ?? null
  );
  const [syncedTaskId, setSyncedTaskId] = useState<string | null>(
    runningEntry?.taskId ?? null
  );
  if (syncedEntryId !== (runningEntry?.id ?? null)) {
    setSyncedEntryId(runningEntry?.id ?? null);
    setSyncedProjectId(runningEntry?.projectId ?? null);
    setSyncedTaskId(runningEntry?.taskId ?? null);
    setDescription(runningEntry?.description ?? "");
    setProjectId(runningEntry?.projectId ?? null);
    setTaskId(runningEntry?.taskId ?? null);
  } else if (runningEntry) {
    // Same entry, but its project/task may have been reassigned elsewhere
    // (e.g. from the entries list). Keep the bar's pickers in sync. Description
    // is intentionally not re-synced here to avoid clobbering in-progress typing
    // while the debounced save is in flight.
    if (syncedProjectId !== (runningEntry.projectId ?? null)) {
      setSyncedProjectId(runningEntry.projectId ?? null);
      setProjectId(runningEntry.projectId ?? null);
    }
    if (syncedTaskId !== (runningEntry.taskId ?? null)) {
      setSyncedTaskId(runningEntry.taskId ?? null);
      setTaskId(runningEntry.taskId ?? null);
    }
  }

  // Debounced description update while running
  useEffect(() => {
    if (!runningEntry || description === runningEntry.description) return;
    const t = setTimeout(() => {
      updateEntry.mutate({ id: runningEntry.id, data: { description } });
    }, 800);
    return () => clearTimeout(t);
  }, [description, runningEntry?.id]);

  const handleStart = () => startTimer({ description, projectId, taskId });
  const handleStop = () => stopTimer();
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    if (isRunning) handleStop();
    else handleStart();
  };

  return (
    <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2 shadow-sm md:h-14 md:flex-nowrap md:gap-3 md:py-0">
      {/* Description input */}
      <Input
        ref={descRef}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What are you working on?"
        className={cn(
          "basis-full border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground md:flex-1 md:basis-auto",
          isRunning && "font-medium"
        )}
      />

      {/* Project picker */}
      <ProjectPicker
        value={projectId}
        onChange={(id) => {
          setProjectId(id);
          setTaskId(null);
          if (runningEntry) {
            updateEntry.mutate({ id: runningEntry.id, data: { projectId: id, taskId: null } });
          }
        }}
        compact
      />

      {/* Task picker — only when a project is selected */}
      <TaskPicker
        projectId={projectId}
        value={taskId}
        onChange={(id) => {
          setTaskId(id);
          if (runningEntry) {
            updateEntry.mutate({ id: runningEntry.id, data: { taskId: id } });
          }
        }}
        compact
      />

      {/* Discard button (only when running) */}
      {isRunning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="animate-in fade-in text-muted-foreground duration-300 hover:text-destructive"
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
      )}

      {/* Favorites: one-click start from a saved preset */}
      {!isRunning && (
        <FavoritesMenu current={{ description, projectId, taskId }} />
      )}

      {/* Combined elapsed + Start/Stop capsule */}
      <TimerControl isRunning={isRunning} onStart={handleStart} onStop={handleStop} />

      <ThemeToggle />

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard running timer?"
        description="The time tracked so far will be permanently deleted. This cannot be undone."
        confirmLabel="Discard"
        onConfirm={discardTimer}
      />
    </header>
  );
}
