import { useState, useRef, useEffect } from "react";
import { Play, Square, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TimerDisplay } from "./TimerDisplay";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { TaskPicker } from "@/components/entries/TaskPicker";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useTimerStore } from "@/stores/timerStore";
import { useTimer } from "@/hooks/useTimer";
import { useUpdateEntry } from "@/hooks/useEntries";
import { formatSeconds, parseTimeInput } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

export function TimerBar() {
  const { runningEntry, elapsed } = useTimerStore();
  const { startTimer, stopTimer, discardTimer, editElapsed, isStarting, isStopping } =
    useTimer();
  const updateEntry = useUpdateEntry();

  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [editingElapsed, setEditingElapsed] = useState(false);
  const [elapsedInput, setElapsedInput] = useState("");
  const descRef = useRef<HTMLInputElement>(null);
  const elapsedRef = useRef<HTMLInputElement>(null);

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

  // Focus + select the elapsed input when entering edit mode
  useEffect(() => {
    if (editingElapsed) {
      elapsedRef.current?.focus();
      elapsedRef.current?.select();
    }
  }, [editingElapsed]);

  const handleStartEditElapsed = () => {
    setElapsedInput(formatSeconds(elapsed));
    setEditingElapsed(true);
  };
  const handleSaveElapsed = () => {
    setEditingElapsed(false);
    const parsed = parseTimeInput(elapsedInput);
    if (parsed !== null && parsed >= 0) editElapsed(parsed);
  };
  const handleElapsedKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveElapsed();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingElapsed(false);
    }
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

      {/* Timer display (only when running) — click to edit elapsed time */}
      {isRunning &&
        (editingElapsed ? (
          <Input
            ref={elapsedRef}
            value={elapsedInput}
            onChange={(e) => setElapsedInput(e.target.value)}
            onKeyDown={handleElapsedKeyDown}
            onBlur={handleSaveElapsed}
            aria-label="Edit elapsed time"
            className="h-8 w-24 text-right font-mono text-lg font-semibold tabular-nums"
          />
        ) : (
          <button
            type="button"
            onClick={handleStartEditElapsed}
            title="Edit elapsed time"
            aria-label="Edit elapsed time"
            className="rounded px-1 transition-colors hover:bg-accent"
          >
            <TimerDisplay
              seconds={elapsed}
              className="min-w-20 animate-in fade-in slide-in-from-right-2 cursor-pointer text-right text-primary duration-300 ease-out"
            />
          </button>
        ))}

      {/* Discard button (only when running) */}
      {isRunning && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 animate-in fade-in text-muted-foreground duration-300 hover:text-destructive"
          onClick={() => setConfirmDiscard(true)}
          title="Discard timer (Alt+Shift+X)"
          aria-label="Discard timer"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}

      {/* Start / Stop — round button with a lit-dome finish (top-to-bottom tint
          overlay + inner highlight/shade via --btn-3d). When running, a red halo
          pulses outward (recording-pulse); when idle, hover deepens the lift and
          blooms a brand glow, press collapses it inward. Reduced-motion users
          still get the color + Stop icon as the running-state cue. */}
      <Button
        variant={isRunning ? "destructive" : "default"}
        size="icon"
        onClick={isRunning ? handleStop : handleStart}
        disabled={isStarting || isStopping}
        className={cn(
          "h-10 w-10 shrink-0 rounded-full bg-linear-to-b from-white/10 to-black/8",
          "transition-[transform,box-shadow] duration-200 ease-out-quint",
          "hover:scale-105 active:scale-95",
          "[box-shadow:var(--btn-3d)]",
          isRunning
            ? "animate-recording-pulse"
            : "hover:[box-shadow:var(--btn-3d-hover)] active:[box-shadow:var(--btn-3d-press)]"
        )}
        title={isRunning ? "Stop timer (Alt+Shift+S)" : "Start timer (Alt+Shift+S)"}
        aria-label={isRunning ? "Stop timer" : "Start timer"}
      >
        {isStarting || isStopping ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRunning ? (
          <Square key="stop" className="h-3.5 w-3.5 animate-scale-in fill-current" />
        ) : (
          <Play key="play" className="h-4 w-4 translate-x-px animate-scale-in fill-current" />
        )}
      </Button>

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
