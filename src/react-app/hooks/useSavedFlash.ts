import { useCallback, useEffect, useRef, useState } from "react";

const SAVED_MS = 1400;

/**
 * Transient "saved" acknowledgement for inline edits.
 *
 * Inline commits (duration, description, time range) fire optimistic mutations
 * on blur and previously said nothing at all — while *deleting* an entry got a
 * toast and an Undo. That inverts the reassurance budget against the stakes:
 * editing a duration is what changes a client's invoice line, and it's the
 * action a consultant repeats dozens of times reconstructing a week.
 *
 * A tick on the field rather than a toast: one toast per keystroke-and-blur
 * would be worse than silence.
 */
export function useSavedFlash(ms = SAVED_MS) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = useCallback(() => {
    clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), ms);
  }, [ms]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { saved, flash };
}
