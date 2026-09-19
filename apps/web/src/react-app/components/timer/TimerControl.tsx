import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTimerStore } from "@/stores/timerStore";
import { useTimer } from "@/hooks/useTimer";
import { formatDurationShort, formatSeconds, parseTimeInput } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

interface TimerControlProps {
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
}

/**
 * The transport control.
 *
 * Idle, it is the composer's send disc: a 40px brand-red circle with a soft
 * red shadow, the only glowing thing on the page. Running, it is the docked
 * bar's Stop disc with the recording ring breathing behind it, followed by
 * the elapsed readout at display size — click the readout to edit it.
 *
 * The whole control is the BRAND red, not the destructive red. Stopping a
 * timer *saves* the entry; discarding is the destructive act, and the trash
 * button beside this one is the only thing in the bar that wears that colour.
 *
 * Fully optimistic — isRunning flips the instant the click fires, before the
 * create/stop request round-trips; a failed request reverts itself and toasts.
 */
export function TimerControl({ isRunning, onStart, onStop }: TimerControlProps) {
  const { elapsed } = useTimerStore();
  const { editElapsed } = useTimer();

  const [editingElapsed, setEditingElapsed] = useState(false);
  const [elapsedInput, setElapsedInput] = useState("");
  const elapsedRef = useRef<HTMLInputElement>(null);

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

  const disc = (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative shrink-0">
          {isRunning && (
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-recording-pulse rounded-full bg-primary"
            />
          )}
          <Button
            variant="default"
            size="icon-lg"
            onClick={isRunning ? onStop : onStart}
            className={cn(
              "tt-touch relative rounded-full",
              // The glow is the composer's: a lit disc on a dark rack. Running,
              // the pulse ring does that job and the shadow comes off.
              isRunning
                ? "shadow-none"
                : "shadow-lg shadow-primary/40 hover:scale-105 hover:shadow-primary/50"
            )}
            aria-label={isRunning ? "Stop timer" : "Start timer"}
          >
            {isRunning ? (
              <Square key="stop" className="h-3.5 w-3.5 animate-scale-in fill-current" />
            ) : (
              <Play key="play" className="h-4 w-4 translate-x-px animate-scale-in fill-current" />
            )}
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isRunning ? "Stop timer" : "Start timer"}
        <span className="ml-1.5 text-background/60">Alt+Shift+S</span>
      </TooltipContent>
    </Tooltip>
  );

  if (!isRunning) return disc;

  return (
    <div className="flex items-center gap-3">
      {disc}
      {editingElapsed ? (
        <Input
          ref={elapsedRef}
          value={elapsedInput}
          onChange={(e) => setElapsedInput(e.target.value)}
          onKeyDown={handleElapsedKeyDown}
          onBlur={handleSaveElapsed}
          aria-label="Edit elapsed time"
          className="h-9 w-36 px-3 text-right font-mono text-2xl font-semibold tabular-nums md:text-2xl"
        />
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleStartEditElapsed}
              // Names the value, not just the verb, so a screen-reader user
              // hears what the timer reads. `formatDurationShort` rather than
              // HH:MM:SS, which a screen reader renders as three numbers.
              aria-label={`${formatDurationShort(elapsed)} elapsed — edit`}
              className="tt-touch flex h-9 items-center rounded-md px-1 transition-colors duration-fast ease-out-quart hover:bg-foreground/6 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span
                role="timer"
                className="min-w-[6.5ch] animate-in fade-in text-right font-mono text-2xl font-semibold tabular-nums text-primary-ink duration-base ease-out-quart"
              >
                {formatSeconds(elapsed)}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Edit elapsed time</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
