import { useEffect, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { api } from "@/lib/api";
import { formatSeconds } from "@/lib/dateUtils";
import { saveTimerState, clearTimerState, loadTimerState } from "@/lib/idb";
import type { TimeEntry } from "@shared/schemas";

export function useTimer() {
  const { runningEntry, localStartTime, setElapsed, setRunningEntry, clearTimer } =
    useTimerStore();
  const queryClient = useQueryClient();

  // ─── Tick loop + tab title ───────────────────────────────────────────────
  useEffect(() => {
    if (!runningEntry || !localStartTime) {
      document.title = "Time Tracker";
      return;
    }
    const tick = () => {
      const s = Math.floor((Date.now() - localStartTime) / 1000);
      setElapsed(s);
      document.title = `${formatSeconds(s)} — Time Tracker`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      document.title = "Time Tracker";
    };
  }, [runningEntry?.id, localStartTime, setElapsed]);

  // ─── Restore from server (+ IDB fallback) on mount ──────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadTimerState();
      if (cancelled) return;
      try {
        const current = (await api.timeEntries.current()) as TimeEntry | null;
        if (cancelled) return;
        if (current) {
          // Running entry on server — restore regardless of IDB state
          const localStartTime = saved?.entryId === current.id
            ? new Date(saved.startedAt).getTime()
            : new Date(current.start).getTime();
          setRunningEntry(current, localStartTime);
          await saveTimerState({
            entryId: current.id,
            startedAt: localStartTime,
            description: current.description,
            projectId: current.projectId,
            projectColor: current.projectColor,
          });
        } else {
          // Nothing running on server — clear any stale IDB state
          await clearTimerState();
        }
      } catch {
        // Offline — fall back to IDB if available
        if (saved) {
          setRunningEntry(
            {
              id: saved.entryId,
              description: saved.description,
              projectId: saved.projectId,
              projectColor: saved.projectColor,
              projectName: null,
              taskId: null,
              taskName: null,
              workspaceId: "",
              start: new Date(saved.startedAt).toISOString(),
              stop: null,
              duration: null,
              billable: false,
              tags: [],
              syncStatus: null,
              externalId: null,
              syncedAt: null,
              syncError: null,
              calendarEventId: null,
              createdAt: new Date(saved.startedAt).toISOString(),
              updatedAt: new Date(saved.startedAt).toISOString(),
            },
            saved.startedAt
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setRunningEntry]);

  // Optimistically drop the just-started entry into every cached time-entries
  // range so it appears in the list immediately instead of after the create
  // round-trip — mirrors patchStopInCache below, just for the opposite edge.
  const patchStartInCache = useCallback(
    (entry: TimeEntry) => {
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) => {
        if (!old || old.some((e) => e.id === entry.id)) return old;
        return [entry, ...old];
      });
    },
    [queryClient]
  );

  // Swap the optimistic placeholder for the real server entry once the create
  // resolves, so the row picks up its real id without waiting on a refetch.
  const replaceInCache = useCallback(
    (optimisticId: string, entry: TimeEntry) => {
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) =>
        old?.map((e) => (e.id === optimisticId ? entry : e))
      );
    },
    [queryClient]
  );

  // Roll back the optimistic row if the create request fails.
  const removeFromCache = useCallback(
    (id: string) => {
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) =>
        old?.filter((e) => e.id !== id)
      );
    },
    [queryClient]
  );

  // ─── Start timer ─────────────────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: async (partial: {
      description?: string;
      projectId?: string | null;
      taskId?: string | null;
      billable?: boolean;
      tags?: string[];
    }) => {
      return api.timeEntries.create({
        description: partial.description ?? "",
        projectId: partial.projectId ?? null,
        taskId: partial.taskId ?? null,
        start: new Date().toISOString(),
        billable: partial.billable ?? false,
        tags: partial.tags ?? [],
      }) as Promise<TimeEntry>;
    },
    onMutate: async (partial) => {
      const now = Date.now();
      const optimistic: TimeEntry = {
        id: `optimistic-${now}`,
        workspaceId: "default",
        description: partial.description ?? "",
        projectId: partial.projectId ?? null,
        projectName: null,
        projectColor: null,
        taskId: partial.taskId ?? null,
        taskName: null,
        start: new Date(now).toISOString(),
        stop: null,
        duration: null,
        billable: partial.billable ?? false,
        tags: partial.tags ?? [],
        syncStatus: null,
        externalId: null,
        syncedAt: null,
        syncError: null,
        calendarEventId: null,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      };
      setRunningEntry(optimistic, now);
      patchStartInCache(optimistic);
      return { optimisticId: optimistic.id };
    },
    onSuccess: async (entry, _partial, context) => {
      setRunningEntry(entry, new Date(entry.start).getTime());
      if (context) replaceInCache(context.optimisticId, entry);
      await saveTimerState({
        entryId: entry.id,
        startedAt: new Date(entry.start).getTime(),
        description: entry.description,
        projectId: entry.projectId,
        projectColor: entry.projectColor,
      });
    },
    onError: (_err, _partial, context) => {
      if (context) removeFromCache(context.optimisticId);
      clearTimer();
      toast.error("Failed to start timer");
    },
  });

  // Optimistically mark the running entry as completed in the entries cache so
  // the day/Today totals stay continuous across the stop → refetch window instead
  // of dipping by the just-tracked time for a beat. Read the store directly so we
  // capture the entry before clearTimer() wipes it.
  const patchStopInCache = useCallback(
    (stopIso: string) => {
      const entry = useTimerStore.getState().runningEntry;
      if (!entry) return;
      const duration = Math.max(
        0,
        Math.round((new Date(stopIso).getTime() - new Date(entry.start).getTime()) / 1000)
      );
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) => {
        if (!old) return old;
        if (old.some((e) => e.id === entry.id)) {
          return old.map((e) => (e.id === entry.id ? { ...e, stop: stopIso, duration } : e));
        }
        // Not in this range's cache — prepend so today's total stays continuous.
        return [{ ...entry, stop: stopIso, duration }, ...old];
      });
    },
    [queryClient]
  );

  // ─── Stop timer ──────────────────────────────────────────────────────────
  const stopMutation = useMutation({
    mutationFn: (id: string) =>
      api.timeEntries.stop(id) as Promise<TimeEntry>,
    onMutate: () => {
      patchStopInCache(new Date().toISOString());
      clearTimer();
    },
    onSuccess: (entry) => {
      clearTimerState();
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      // Flash the row it just became so the eye tracks where it landed.
      if (entry) useUIStore.getState().flashEntry(entry.id);
    },
    onError: () => {
      toast.error("Failed to stop timer — please try again");
      queryClient.invalidateQueries({ queryKey: ["timer-current"] });
    },
  });

  // ─── Stop at a specific time (used to trim idle time) ─────────────────────
  const stopAtMutation = useMutation({
    mutationFn: (iso: string) => {
      if (!runningEntry) throw new Error("No running timer");
      return api.timeEntries.update(runningEntry.id, { stop: iso }) as Promise<TimeEntry>;
    },
    onMutate: (iso) => {
      patchStopInCache(iso);
      clearTimer();
    },
    onSuccess: (entry) => {
      clearTimerState();
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      if (entry) useUIStore.getState().flashEntry(entry.id);
    },
    onError: () => {
      toast.error("Failed to stop timer — please try again");
      queryClient.invalidateQueries({ queryKey: ["timer-current"] });
    },
  });

  // ─── Discard timer ───────────────────────────────────────────────────────
  const discardMutation = useMutation({
    mutationFn: (id: string) => api.timeEntries.delete(id),
    onMutate: () => clearTimer(),
    onSuccess: () => clearTimerState(),
    onError: () => toast.error("Failed to discard timer"),
  });

  // ─── Edit elapsed ────────────────────────────────────────────────────────
  // Set the running timer's elapsed time to `seconds` by shifting its start
  // back to `now - seconds`; the timer keeps ticking from the new value. The
  // display reads only `localStartTime`, so we update the store optimistically
  // and persist to IDB, then mirror the new start to the server.
  const editElapsedMutation = useMutation({
    mutationFn: (seconds: number) => {
      if (!runningEntry) throw new Error("No running timer");
      const newStart = Date.now() - seconds * 1000;
      return api.timeEntries.update(runningEntry.id, {
        start: new Date(newStart).toISOString(),
      }) as Promise<TimeEntry>;
    },
    onMutate: async (seconds) => {
      if (!runningEntry) return;
      const newStart = Date.now() - seconds * 1000;
      setRunningEntry(runningEntry, newStart);
      setElapsed(seconds); // avoid a 1-frame flash to 00:00:00 before the tick
      await saveTimerState({
        entryId: runningEntry.id,
        startedAt: newStart,
        description: runningEntry.description,
        projectId: runningEntry.projectId,
        projectColor: runningEntry.projectColor,
      });
    },
    onError: () => {
      toast.error("Failed to update timer");
      queryClient.invalidateQueries({ queryKey: ["timer-current"] });
    },
  });

  const startTimer = useCallback(
    (
      partial: {
        description?: string;
        projectId?: string | null;
        taskId?: string | null;
        billable?: boolean;
        tags?: string[];
      } = {}
    ) => startMutation.mutate(partial),
    [startMutation]
  );

  const stopTimer = useCallback(() => {
    if (runningEntry) stopMutation.mutate(runningEntry.id);
  }, [runningEntry, stopMutation]);

  const discardTimer = useCallback(() => {
    if (runningEntry) discardMutation.mutate(runningEntry.id);
  }, [runningEntry, discardMutation]);

  // Stop the running timer at an explicit ISO time (e.g. trim idle time back to
  // when the user went away).
  const stopTimerAt = useCallback(
    (iso: string) => {
      if (runningEntry) stopAtMutation.mutate(iso);
    },
    [runningEntry, stopAtMutation]
  );

  const editElapsed = useCallback(
    (seconds: number) => {
      if (runningEntry && seconds >= 0) editElapsedMutation.mutate(seconds);
    },
    [runningEntry, editElapsedMutation]
  );

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────
  useHotkeys(
    "alt+shift+s",
    () => (runningEntry ? stopTimer() : startTimer()),
    { preventDefault: true },
    [runningEntry, stopTimer, startTimer]
  );
  // Routes through the same confirm dialog as the trash-icon button (owned by
  // TimerBar, opened via the shared uiStore flag) rather than discarding
  // straight away — a stray keypress shouldn't silently delete tracked time.
  useHotkeys(
    "alt+shift+x",
    () => {
      if (runningEntry) useUIStore.getState().setDiscardConfirmOpen(true);
    },
    { preventDefault: true },
    [runningEntry]
  );

  return {
    startTimer,
    stopTimer,
    stopTimerAt,
    discardTimer,
    editElapsed,
  };
}
