import { useEffect, useRef, useState } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimerDisplay } from "./TimerDisplay";
import { useTimerStore } from "@/stores/timerStore";
import { useTimer } from "@/hooks/useTimer";
import { formatSeconds, parseTimeInput } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

interface TimerControlProps {
  isRunning: boolean;
  isBusy: boolean; // isStarting || isStopping
  onStart: () => void;
  onStop: () => void;
}

/**
 * Self-contained Start/Stop capsule that combines the live elapsed readout and
 * the action button into a single morphing pill. Idle: a compact round Start
 * button. Running: the capsule tints red and reveals the click-to-edit elapsed
 * time next to a Stop button, pulsing like a heartbeat. Reduced-motion users
 * still get the color + Stop icon as the running-state cue (the global
 * prefers-reduced-motion rule stills the heartbeat).
 */
export function TimerControl({ isRunning, isBusy, onStart, onStop }: TimerControlProps) {
  const { elapsed } = useTimerStore();
  const { editElapsed } = useTimer();

  const [editingElapsed, setEditingElapsed] = useState(false);
  const [elapsedInput, setElapsedInput] = useState("");
  const elapsedRef = useRef<HTMLInputElement>(null);

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
    <div
      className={cn(
        "relative flex items-center gap-1 rounded-full transition-all duration-500 ease-out-quint",
        isRunning ? "bg-destructive/10 pl-3 pr-1" : "bg-transparent"
      )}
    >
      {/* Elapsed readout (only when running) — click to edit elapsed time.
          Cross-fades/slides in as the capsule morphs open. */}
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
            className="rounded px-1 transition-colors hover:bg-accent/50"
          >
            <TimerDisplay
              seconds={elapsed}
              className="min-w-20 animate-in fade-in slide-in-from-right-2 cursor-pointer text-right text-destructive duration-300 ease-out"
            />
          </button>
        ))}

      {/* Start / Stop — round button with a lit-dome finish (top-to-bottom tint
          overlay + inner highlight/shade via --btn-3d). When running, a red
          heartbeat pulses outward (double-beat scale + expanding ring); when
          idle, hover deepens the lift and blooms a brand glow, press collapses
          it inward. */}
      <Button
        variant={isRunning ? "destructive" : "default"}
        size="icon"
        onClick={isRunning ? onStop : onStart}
        disabled={isBusy}
        className={cn(
          "h-10 w-10 shrink-0 rounded-full bg-linear-to-b from-white/10 to-black/8",
          "transition-[transform,box-shadow] duration-200 ease-out-quint",
          "[box-shadow:var(--btn-3d)]",
          isRunning
            ? "animate-heartbeat"
            : "hover:scale-105 active:scale-95 hover:[box-shadow:var(--btn-3d-hover)] active:[box-shadow:var(--btn-3d-press)]"
        )}
        title={isRunning ? "Stop timer (Alt+Shift+S)" : "Start timer (Alt+Shift+S)"}
        aria-label={isRunning ? "Stop timer" : "Start timer"}
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRunning ? (
          <Square key="stop" className="h-3.5 w-3.5 animate-scale-in fill-current" />
        ) : (
          <Play key="play" className="h-4 w-4 translate-x-px animate-scale-in fill-current" />
        )}
      </Button>
    </div>
  );
}
