import { useEffect } from "react";
import { notify } from "@/lib/notify";

// While `active` (enabled AND no timer running), nudge the user every
// `intervalMinutes` that they aren't tracking time. The interval resets whenever
// tracking resumes because `active` flips false and the effect tears down.
export function useTrackingReminder(active: boolean, intervalMinutes: number) {
  useEffect(() => {
    if (!active || intervalMinutes <= 0) return;
    const ms = intervalMinutes * 60_000;
    const id = window.setInterval(() => {
      notify("Not tracking time", "You have no timer running — start one to keep your day accurate.");
    }, ms);
    return () => window.clearInterval(id);
  }, [active, intervalMinutes]);
}
