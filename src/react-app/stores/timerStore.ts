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
      // A stopped entry is a clear, not a running one. Not every stop arrives
      // as `timer:stop` — trimming idle time and the edit sheet both close the
      // entry through the ordinary update route, which broadcasts
      // `entries:changed` carrying the now-stopped row. Without this check the
      // receiving tab stored that row as `runningEntry` and kept counting an
      // entry the server had already closed.
      if (entry === null || entry.stop) {
        return { runningEntry: null, localStartTime: null, elapsed: 0 };
      }
      if (state.runningEntry?.id === entry.id) {
        // Same entry — keep the local anchor so the readout doesn't jitter on
        // clock skew, UNLESS the start itself moved. Correcting a running
        // entry's start (inline, or in the edit sheet) has to move the elapsed
        // count with it; without this the timer kept counting from the old
        // anchor and the bar disagreed with the row it was editing.
        if (state.runningEntry.start !== entry.start) {
          const localStartTime = new Date(entry.start).getTime();
          return {
            runningEntry: entry,
            localStartTime,
            elapsed: Math.max(0, Math.floor((Date.now() - localStartTime) / 1000)),
          };
        }
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
