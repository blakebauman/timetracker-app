import { create } from "zustand";
import type { TimeEntry } from "@shared/schemas";

interface TimerStore {
  runningEntry: TimeEntry | null;
  localStartTime: number | null; // Date.now() at the moment timer started
  elapsed: number; // seconds

  setRunningEntry: (entry: TimeEntry | null, localStartTime?: number) => void;
  setElapsed: (seconds: number) => void;
  clearTimer: () => void;
  setFromWS: (entry: TimeEntry | null) => void;
}

export const useTimerStore = create<TimerStore>((set) => ({
  runningEntry: null,
  localStartTime: null,
  elapsed: 0,

  // Computes elapsed synchronously from `localStartTime` instead of always
  // zeroing it — a genuinely fresh start (localStartTime = now) still reads
  // 0, but restoring an already-running entry (on mount, or mid-timer once
  // an optimistic start's create request resolves) lands on the correct
  // elapsed in the same update instead of a 0 frame that a later tick fixes.
  setRunningEntry: (entry, localStartTime) => {
    const start = localStartTime ?? (entry ? Date.now() : null);
    const elapsed = entry && start ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0;
    set({ runningEntry: entry, localStartTime: start, elapsed });
  },

  setElapsed: (seconds) => set({ elapsed: seconds }),

  clearTimer: () =>
    set({ runningEntry: null, localStartTime: null, elapsed: 0 }),

  setFromWS: (entry) =>
    set((state) => {
      if (entry === null) {
        return { runningEntry: null, localStartTime: null, elapsed: 0 };
      }
      // Only update if this is a different entry
      if (state.runningEntry?.id === entry.id) {
        return { runningEntry: entry };
      }
      // New entry from another tab — calculate elapsed from entry's start time
      const localStartTime =
        Date.now() - (Date.now() - new Date(entry.start).getTime());
      return {
        runningEntry: entry,
        localStartTime,
        elapsed: Math.floor(
          (Date.now() - new Date(entry.start).getTime()) / 1000
        ),
      };
    }),
}));
