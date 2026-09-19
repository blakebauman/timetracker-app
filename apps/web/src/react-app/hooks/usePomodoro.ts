import { useEffect } from "react";
import { notify } from "@/lib/notify";

// A lightweight pomodoro layered on the running timer: while `active`, it counts
// a work interval, notifies at the boundary, runs a break, then repeats. Purely
// notification-driven (no UI state), so it stays a cheap side-effect.
export function usePomodoro(active: boolean, workMinutes: number, breakMinutes: number) {
  useEffect(() => {
    if (!active || workMinutes <= 0 || breakMinutes <= 0) return;

    let phase: "work" | "break" = "work";
    let endsAt = Date.now() + workMinutes * 60_000;

    const id = window.setInterval(() => {
      if (Date.now() < endsAt) return;
      if (phase === "work") {
        phase = "break";
        endsAt = Date.now() + breakMinutes * 60_000;
        notify("Time for a break", `Nice focus — take ${breakMinutes} min.`);
      } else {
        phase = "work";
        endsAt = Date.now() + workMinutes * 60_000;
        notify("Back to work", "Break's over — starting another focus block.");
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [active, workMinutes, breakMinutes]);
}
