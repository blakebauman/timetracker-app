import { useEffect, useRef } from "react";
import { useUIStore } from "@/stores/uiStore";
import { useTimerStore } from "@/stores/timerStore";
import { useIdleDetection } from "@/hooks/useIdleDetection";
import { useTrackingReminder } from "@/hooks/useTrackingReminder";
import { usePomodoro } from "@/hooks/usePomodoro";
import { notify } from "@/lib/notify";
import { IdleDialog } from "./IdleDialog";

// Headless coordinator for the productivity features. Mounted once in AppShell;
// runs the idle / reminder / pomodoro hooks against the current timer state and
// renders the idle prompt. Each feature is a no-op until enabled in Settings.
export function ProductivityManager() {
  const p = useUIStore((s) => s.productivity);
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const isRunning = Boolean(runningEntry);

  const { idleSince, clear } = useIdleDetection(
    p.idleEnabled && isRunning,
    p.idleThresholdMinutes * 60_000
  );

  // Notify once each time an idle window opens.
  const notifiedFor = useRef<number | null>(null);
  useEffect(() => {
    if (idleSince && notifiedFor.current !== idleSince) {
      notifiedFor.current = idleSince;
      notify("Still tracking?", "You've gone idle while a timer is running.");
    }
    if (!idleSince) notifiedFor.current = null;
  }, [idleSince]);

  useTrackingReminder(p.reminderEnabled && !isRunning, p.reminderIntervalMinutes);
  usePomodoro(p.pomodoroEnabled && isRunning, p.pomodoroWorkMinutes, p.pomodoroBreakMinutes);

  // Remount per idle window so the dialog's live clock initializes fresh.
  return <IdleDialog key={idleSince ?? "none"} idleSince={idleSince} onResolve={clear} />;
}
