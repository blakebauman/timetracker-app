import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimerDisplay } from "./TimerDisplay";
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
 * Self-contained Start/Stop capsule that combines the live elapsed readout and
 * the action button into a single morphing pill. Idle: a flat round Start
 * button. Running: the capsule tints, reveals the click-to-edit elapsed time
 * next to a Stop button, and a soft ring breathes behind the disc to signal
 * "recording". Reduced-motion users still get the tint + Stop icon as the
 * running-state cue (the global prefers-reduced-motion rule stills the pulse).
 *
 * The whole control is in the BRAND red, not the destructive red, and the two
 * are different colours (`--primary` 0.588/0.207 vs `--destructive`
 * 0.577/0.245). Stopping a timer is not destructive — it *saves* the entry;
 * discarding is the destructive act, and the trash button beside this one is
 * the only thing in the bar that should wear that colour. Running the elapsed
 * readout on `--destructive` also failed AA in both themes (3.93:1 light,
 * 3.43:1 dark on its own /10 tint, at 18px/600 — 13.5pt, under WCAG's
 * large-text threshold). `--primary-ink` is the brand red calibrated as text
 * and measures 5.47:1 / 6.37:1 on the same ground; DESIGN.md §2 already named
 * this exact element as one of its three call sites.
 * Fully optimistic — isRunning flips (and the icon/color swap) the instant the
 * click fires, before the create/stop request round-trips, so there's no
 * loading state to show; a failed request reverts itself and toasts.
 */
export function TimerControl({ isRunning, onStart, onStop }: TimerControlProps) {
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
        "relative flex items-center gap-1 rounded-full transition-all duration-slow ease-out-quint",
        isRunning ? "bg-primary/10 pl-3 pr-1" : "bg-transparent"
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
            className="h-8 w-28 px-2 text-right font-mono text-lg font-semibold tabular-nums md:text-lg"
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleStartEditElapsed}
                // Names the value, not just the verb. "Edit elapsed time" alone
                // told a screen-reader user there was a control here but never
                // what the timer actually read — the one number the whole app
                // exists to report. Read from `formatDurationShort` rather than
                // the HH:MM:SS display, which a screen reader renders as three
                // unrelated numbers.
                aria-label={`${formatDurationShort(elapsed)} elapsed — edit`}
                className="tt-touch flex h-8 items-center rounded px-1.5 transition-colors duration-fast ease-out-quart hover:bg-accent/50"
              >
                <TimerDisplay
                  seconds={elapsed}
                  className="min-w-20 animate-in fade-in slide-in-from-right-2 cursor-pointer text-right text-primary-ink duration-base ease-out-quart"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>Edit elapsed time</TooltipContent>
          </Tooltip>
        ))}

      {/* Start / Stop — a flat solid disc, no gradient/inner-shadow depth. When
          running, a separate ring behind the button breathes outward to read
          as "recording" while the disc itself stays put. */}
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
              // `size="icon"` + `h-10 w-10` is the override DESIGN.md §8 bans by
              // name: it renders the same 40px as `icon-lg` until someone
              // retunes the token, at which point this control silently stops
              // matching every other 40px button in the app.
              size="icon-lg"
              onClick={isRunning ? onStop : onStart}
              className="tt-touch relative cursor-pointer rounded-full"
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
    </div>
  );
}
