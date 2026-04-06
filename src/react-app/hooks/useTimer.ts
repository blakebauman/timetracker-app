import { useEffect, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useHotkeys } from "react-hotkeys-hook";
import { useTimerStore } from "@/stores/timerStore";
import { api } from "@/lib/api";
import { saveTimerState, clearTimerState, loadTimerState } from "@/lib/idb";
import type { TimeEntry } from "@shared/schemas";

export function useTimer() {
  const { runningEntry, localStartTime, setElapsed, setRunningEntry, clearTimer } =
    useTimerStore();
  const queryClient = useQueryClient();

  // ─── Tick loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!runningEntry || !localStartTime) return;
    const tick = () =>
      setElapsed(Math.floor((Date.now() - localStartTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [runningEntry?.id, localStartTime, setElapsed]);

  // ─── Restore from IDB on mount ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadTimerState().then(async (saved) => {
      if (cancelled || !saved) return;
      try {
        const current = (await api.timeEntries.current()) as TimeEntry | null;
        if (current?.id === saved.entryId) {
          setRunningEntry(current, new Date(saved.startedAt).getTime());
        } else {
          await clearTimerState();
        }
      } catch {
        // Offline — restore from IDB state
        setRunningEntry(
          {
            id: saved.entryId,
            description: saved.description,
            projectId: saved.projectId,
            projectColor: saved.projectColor,
            projectName: null,
            taskId: null,
            taskName: null,
            workspaceId: "default",
            start: new Date(saved.startedAt).toISOString(),
            stop: null,
            duration: null,
            billable: false,
            tags: [],
            createdAt: new Date(saved.startedAt).toISOString(),
            updatedAt: new Date(saved.startedAt).toISOString(),
          },
          saved.startedAt
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [setRunningEntry]);

  // ─── Start timer ─────────────────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: async (partial: {
      description?: string;
      projectId?: string | null;
      taskId?: string | null;
      billable?: boolean;
    }) => {
      return api.timeEntries.create({
        description: partial.description ?? "",
        projectId: partial.projectId ?? null,
        taskId: partial.taskId ?? null,
        start: new Date().toISOString(),
        billable: partial.billable ?? false,
        tags: [],
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
        tags: [],
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      };
      setRunningEntry(optimistic, now);
    },
    onSuccess: async (entry) => {
      setRunningEntry(entry, new Date(entry.start).getTime());
      await saveTimerState({
        entryId: entry.id,
        startedAt: new Date(entry.start).getTime(),
        description: entry.description,
        projectId: entry.projectId,
        projectColor: entry.projectColor,
      });
    },
    onError: () => clearTimer(),
  });

  // ─── Stop timer ──────────────────────────────────────────────────────────
  const stopMutation = useMutation({
    mutationFn: (id: string) =>
      api.timeEntries.stop(id) as Promise<TimeEntry>,
    onMutate: () => clearTimer(),
    onSuccess: () => {
      clearTimerState();
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: () =>
      queryClient.invalidateQueries({ queryKey: ["timer-current"] }),
  });

  // ─── Discard timer ───────────────────────────────────────────────────────
  const discardMutation = useMutation({
    mutationFn: (id: string) => api.timeEntries.delete(id),
    onMutate: () => clearTimer(),
    onSuccess: () => clearTimerState(),
  });

  const startTimer = useCallback(
    (
      partial: {
        description?: string;
        projectId?: string | null;
        taskId?: string | null;
        billable?: boolean;
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

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────
  useHotkeys(
    "alt+shift+s",
    () => (runningEntry ? stopTimer() : startTimer()),
    { preventDefault: true },
    [runningEntry, stopTimer, startTimer]
  );
  useHotkeys(
    "alt+shift+x",
    () => discardTimer(),
    { preventDefault: true },
    [discardTimer]
  );

  return {
    startTimer,
    stopTimer,
    discardTimer,
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
  };
}
