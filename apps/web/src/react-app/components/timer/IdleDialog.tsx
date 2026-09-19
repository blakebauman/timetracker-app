import { useEffect, useState } from "react";
import { Coffee } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTimer } from "@/hooks/useTimer";

interface IdleDialogProps {
  // Timestamp (ms) at which the user went idle, or null when not idle.
  idleSince: number | null;
  onResolve: () => void;
}

// Shown when idle detection trips while a timer is running. Lets the user keep
// the idle time, trim it (stop the entry at the moment they went away), or throw
// the whole entry out. Mounted with a `key` per idle window so `now` starts
// fresh (see ProductivityManager).
export function IdleDialog({ idleSince, onResolve }: IdleDialogProps) {
  const { stopTimerAt, discardTimer } = useTimer();
  const open = idleSince !== null;

  // Live clock, refreshed off-render so the minute count grows while the prompt
  // is open without calling Date.now() during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [open]);

  const idleMinutes = idleSince ? Math.max(1, Math.round((now - idleSince) / 60_000)) : 0;
  const idleClock = idleSince
    ? new Date(idleSince).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const keep = () => onResolve();

  const discardIdle = () => {
    if (idleSince) stopTimerAt(new Date(idleSince).toISOString());
    onResolve();
  };

  const discardAll = () => {
    discardTimer();
    onResolve();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onResolve()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="h-4 w-4" />
            You've been away
          </DialogTitle>
          <DialogDescription>
            No activity since {idleClock} — that's about {idleMinutes}{" "}
            {idleMinutes === 1 ? "minute" : "minutes"} of idle time on your running timer.
            What should happen to it?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={keep}>
            Keep the time
          </Button>
          <Button variant="outline" className="w-full" onClick={discardIdle}>
            Discard idle time (stop at {idleClock})
          </Button>
          <Button
            variant="ghost"
            className="w-full text-destructive hover:text-destructive"
            onClick={discardAll}
          >
            Discard the whole entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
