import { create } from "zustand";
import type { TimeEntry } from "@timetracker/core/schemas";
import { readTimerMirror } from "@/lib/idb";
import { entryFromTimerState } from "@/lib/timerSnapshot";

/** What a start pressed during the restore asked for — see `deferredStart`. */
export interface DeferredStart {
  description?: string;
  projectId?: string | null;
  taskId?: string | null;
  billable?: boolean;
  tags?: string[];
  fromBar?: boolean;
  /** ISO instant of the press. */
  start: string;
}

interface TimerStore {
  runningEntry: TimeEntry | null;
  localStartTime: number | null; // Date.now() at the moment timer started
  elapsed: number; // seconds
  /**
   * True until the mount restore (useTimerLifecycle) has heard from the
   * server, or failed to. While it is, an idle bar is a *guess*: Start is held
   * and transitions aren't announced, because a restore is not the user
   * starting or stopping anything.
   */
  restoring: boolean;
  setRestored: () => void;
  /**
   * A start pressed while `restoring`, with the instant it was pressed. Held
   * rather than dropped — a dropped Enter is a keystroke that silently did
   * nothing — and applied by useTimerLifecycle once the restore has answered
   * *and* found nothing running.
   */
  deferredStart: DeferredStart | null;
  setDeferredStart: (start: DeferredStart | null) => void;
  /**
   * The entry just stopped, and until when "Keep running" can reopen it. One
   * window for every stop — online, offline, with or without a project — and
   * the bar reads it too, so the undo sits beside the disc that was pressed
   * rather than only in a toast across the screen.
   */
  lastStopped: { entry: TimeEntry; until: number } | null;
  setLastStopped: (value: { entry: TimeEntry; until: number } | null) => void;

  setRunningEntry: (entry: TimeEntry | null, localStartTime?: number) => void;
  setElapsed: (seconds: number) => void;
  clearTimer: () => void;
  setFromWS: (entry: TimeEntry | null) => void;
}

// Seed from the synchronous mirror so a running timer is on screen in the
// first frame of a page load (see readTimerMirror); the server reconciles it.
const seeded = readTimerMirror();

export const useTimerStore = create<TimerStore>((set) => ({
  runningEntry: seeded ? entryFromTimerState(seeded) : null,
  localStartTime: seeded?.startedAt ?? null,
  elapsed: seeded ? Math.max(0, Math.floor((Date.now() - seeded.startedAt) / 1000)) : 0,
  restoring: true,
  setRestored: () => set({ restoring: false }),
  deferredStart: null,
  setDeferredStart: (deferredStart) => set({ deferredStart }),
  lastStopped: null,
  setLastStopped: (lastStopped) => set({ lastStopped }),

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
