import { useCallback, useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

// Fires while `active`. Tracks the last user activity and, once the user has
// been idle for `thresholdMs`, exposes the timestamp at which they went idle.
// The value stays frozen until `clear()` is called (i.e. the user resolves the
// idle prompt), so returning activity doesn't lose the idle window.
export function useIdleDetection(active: boolean, thresholdMs: number) {
  const [idleSince, setIdleSince] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const frozen = useRef(false);

  // Reset the idle window whenever tracking starts/stops (adjust-state-during-
  // render pattern — avoids a synchronous setState inside the effect).
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setIdleSince(null);
  }

  const clear = useCallback(() => {
    frozen.current = false;
    lastActivity.current = Date.now();
    setIdleSince(null);
  }, []);

  useEffect(() => {
    if (!active) return;
    frozen.current = false;
    lastActivity.current = Date.now();

    const onActivity = () => {
      // While an idle window is open we keep it frozen until the user resolves it.
      if (!frozen.current) lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    );
    const onVisible = () => {
      if (document.visibilityState === "visible" && !frozen.current) {
        lastActivity.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const id = window.setInterval(() => {
      if (frozen.current) return;
      if (Date.now() - lastActivity.current >= thresholdMs) {
        frozen.current = true;
        setIdleSince(lastActivity.current);
      }
    }, 15_000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [active, thresholdMs]);

  return { idleSince, clear };
}
