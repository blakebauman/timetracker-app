import { useEffect, useRef, useState, type Ref } from "react";
import { toast } from "sonner";
import { CloudOff, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIT_DISC } from "@/components/ui/lit-disc";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useTimer } from "@/hooks/useTimer";
import { usePendingMutationCount } from "@/hooks/useOfflineSync";
import {
  formatDurationShort,
  formatEntryTime,
  formatSeconds,
  parseTimeInput,
  parseTimeOfDayInput,
} from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

interface TimerControlProps {
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  /** The disc, so the bar can put focus back on it after it swaps bodies. */
  discRef?: Ref<HTMLButtonElement>;
  /** Idle only: the page is still finding out whether a timer is running. */
  pending?: boolean;
}

// The readout and its editor share one box, sized in the mono face's own `ch`,
// so opening the editor doesn't shove the rest of the bar sideways.
const READOUT_BOX = "w-[calc(8ch+0.5rem)] font-mono text-2xl font-semibold tabular-nums";

/**
 * The transport control.
 *
 * Idle, it is the composer's send disc: a 40px brand-red circle with a soft
 * red shadow, the only glowing thing on the page. Running, it is the docked
 * bar's Stop disc with the recording ring breathing behind it, followed by
 * the elapsed readout at display size and, under it, when the timer started.
 * Both figures are editable in place: the readout takes a duration, the start
 * takes a clock time — the one a consultant reconciling against a calendar
 * actually has in front of them.
 *
 * The whole control is the BRAND red, not the destructive red. Stopping a
 * timer *saves* the entry; discarding is the destructive act, and the trash
 * button beside this one is the only thing in the bar that wears that colour.
 *
 * Fully optimistic — isRunning flips the instant the click fires, before the
 * create/stop request round-trips; a failed request puts the timer back and
 * says so (see useTimer).
 */
export function TimerControl({ isRunning, onStart, onStop, discRef, pending = false }: TimerControlProps) {
  const elapsed = useTimerStore((s) => s.elapsed);
  const localStartTime = useTimerStore((s) => s.localStartTime);
  const timeFormat = useUIStore((s) => s.timeFormat);
  const { editElapsed } = useTimer();
  // Anything queued means this timer, or something it depends on, hasn't
  // reached the server yet. Said beside the readout because that's where the
  // eye goes to ask "is this real?".
  const pendingCount = usePendingMutationCount();

  const [editing, setEditing] = useState<"elapsed" | "start" | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Where focus goes back to when an edit closes, so Enter/Escape don't drop a
  // keyboard user onto <body>.
  const returnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startIso = localStartTime !== null ? new Date(localStartTime).toISOString() : null;

  const openEditor = (which: "elapsed" | "start", from: HTMLButtonElement) => {
    returnRef.current = from;
    setDraft(
      which === "elapsed" ? formatSeconds(elapsed) : startIso ? formatEntryTime(startIso, timeFormat) : ""
    );
    setEditing(which);
  };

  const closeEditor = (restoreFocus: boolean) => {
    setEditing(null);
    if (restoreFocus) requestAnimationFrame(() => returnRef.current?.focus());
  };

  const save = (restoreFocus: boolean) => {
    const which = editing;
    closeEditor(restoreFocus);
    if (which === "elapsed") {
      const parsed = parseTimeInput(draft);
      if (parsed !== null && parsed >= 0) editElapsed(parsed);
      return;
    }
    if (which === "start" && localStartTime !== null) {
      const tod = parseTimeOfDayInput(draft);
      if (!tod) {
        toast.error("That isn't a time", { description: "Try 9:05 or 9:05am." });
        return;
      }
      // Same calendar day the timer started on, so an overnight timer can be
      // corrected without jumping a day.
      const next = new Date(localStartTime);
      next.setHours(tod.hours, tod.minutes, 0, 0);
      const seconds = Math.floor((Date.now() - next.getTime()) / 1000);
      if (seconds < 0) {
        toast.error("The start can't be in the future");
        return;
      }
      editElapsed(seconds);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      save(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeEditor(true);
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
            ref={discRef}
            variant="default"
            size="icon-lg"
            onClick={isRunning ? onStop : onStart}
            // Busy, not disabled: a press now is held and applied once the
            // page knows nothing is running (useTimer's deferred start).
            aria-busy={!isRunning && pending ? true : undefined}
            aria-keyshortcuts="Alt+Shift+S"
            className={cn(
              "relative rounded-full",
              // The house ring at 50% vanishes against the red fill, so the
              // disc lifts it off with an offset in the ground colour.
              "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              // The glow is the composer's: a lit disc on a dark rack. Running,
              // the pulse ring does that job and the shadow comes off.
              isRunning
                ? "shadow-none"
                : cn(LIT_DISC, "hover:scale-105 hover:shadow-primary/50")
            )}
            aria-label={isRunning ? "Stop timer" : "Start timer"}
          >
            {isRunning ? (
              <Square key="stop" className="h-3.5 w-3.5 animate-scale-in fill-current" />
            ) : pending ? (
              <Spinner key="pending" />
            ) : (
              <Play key="play" className="h-4 w-4 translate-x-px animate-scale-in fill-current" />
            )}
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isRunning ? "Stop timer" : "Start timer"}
        <Kbd className="ml-1.5">Alt+Shift+S</Kbd>
      </TooltipContent>
    </Tooltip>
  );

  if (!isRunning) return disc;

  const editorInput = (label: string, className: string) => (
    <Input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => save(false)}
      aria-label={label}
      className={className}
    />
  );

  return (
    <div className="flex items-center gap-3">
      {disc}
      <div className="flex flex-col items-start">
        {editing === "elapsed" ? (
          editorInput(
            "Edit elapsed time",
            cn(READOUT_BOX, "h-9 px-1 text-right md:text-2xl")
          )
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => openEditor("elapsed", e.currentTarget)}
                // Names the value, not just the verb, so a screen-reader user
                // hears what the timer reads. `formatDurationShort` rather than
                // HH:MM:SS, which a screen reader renders as three numbers.
                aria-label={`${formatDurationShort(elapsed)} elapsed — edit`}
                className={cn(
                  READOUT_BOX,
                  "tt-touch relative flex h-9 items-center justify-end rounded-md px-1 text-primary-ink transition-colors duration-fast ease-out-quart hover:bg-foreground/6 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                )}
              >
                <span className="animate-in fade-in duration-base ease-out-quart">
                  {formatSeconds(elapsed)}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Edit elapsed time</TooltipContent>
          </Tooltip>
        )}
        {startIso && (
          <div className="flex h-5 items-center gap-1 pl-1">
            {editing === "start" ? (
              editorInput(
                "Edit start time",
                "h-5 w-[9ch] rounded-md px-1 font-mono text-xs tabular-nums md:text-xs"
              )
            ) : (
              <button
                type="button"
                onClick={(e) => openEditor("start", e.currentTarget)}
                aria-label={`Started at ${formatEntryTime(startIso, timeFormat)} — edit`}
                className="tt-touch relative rounded-md font-mono text-xs tabular-nums text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                since {formatEntryTime(startIso, timeFormat)}
              </button>
            )}
            {pendingCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="img"
                    aria-label="Not synced yet — will sync when you reconnect"
                    className="text-muted-foreground"
                  >
                    <CloudOff aria-hidden className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Not synced yet — will sync when you reconnect</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
