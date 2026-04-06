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

  setRunningEntry: (entry, localStartTime) =>
    set({
      runningEntry: entry,
      localStartTime: localStartTime ?? (entry ? Date.now() : null),
      elapsed: 0,
    }),

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
