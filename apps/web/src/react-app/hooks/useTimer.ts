import { useEffect, useCallback, useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { invalidateEntryDerived } from "@/hooks/useEntries";
import { api, isQueuedOffline, mutationErrorMessage } from "@/lib/api";
import { formatSeconds, formatDurationShort, formatEntryTime } from "@/lib/dateUtils";
import {
  saveTimerState,
  clearTimerState,
  loadTimerState,
  getPendingMutations,
} from "@/lib/idb";
import { entryFromTimerState, timerStateOf } from "@/lib/timerSnapshot";
import {
  trackPendingStart,
  settleEntryId,
  isOptimisticEntryId,
  amendQueuedStart,
  hasQueuedRunningCreate,
  reopenQueuedCreate,
} from "@/lib/pendingStart";
import { compareLocalDates, todayLocalDate } from "@timetracker/core/task-recurrence";
import type { TimeEntry, Task } from "@timetracker/core/schemas";

/**
 * Does the range a `["time-entries", since, until]` cache holds contain `start`?
 *
 * Optimistic inserts used to go into *every* cached range unconditionally,
 * which shows a row the server will not return: starting a timer while the list
 * is scoped to last week (or to a stale "today" from before midnight — see
 * useDayRollover) rendered the entry, and the refetch after Stop silently took
 * it away again. Same half-open window as the list endpoint's
 * `start >= since AND start < until`, compared as UTC ISO strings, which sort
 * lexicographically. Unranged caches keep the old always-write behaviour.
 */
function rangeContains(key: readonly unknown[], start: string): boolean {
  const [, since, until] = key;
  if (typeof since !== "string" || typeof until !== "string") return true;
  return start >= since && start < until;
}

/**
 * What the timer bar would start. Shared by `startTimer` and the Alt+Shift+S
 * hotkey so the button and the shortcut it advertises can never diverge.
 *
 * `billable` is deliberately optional: omitted means "inherit from the project"
 * server-side, which is not the same as an explicit `false`.
 */
export interface StartTimerInput {
  description?: string;
  projectId?: string | null;
  taskId?: string | null;
  billable?: boolean;
  tags?: string[];
  /**
   * Started from the bar's own draft. Only matters for a start held during
   * the mount restore: applied later, it takes the bar's draft *then*, so
   * text typed after the press isn't thrown away.
   */
  fromBar?: boolean;
}

/**
 * This tab started, stopped or discarded something: the mount restore's
 * answer (requested before it) must no longer be applied. Socket updates set
 * the same flag from `timerStore.setFromWS`. See `restoreSuperseded`.
 */
function markActed() {
  useTimerStore.getState().supersedeRestore();
}

/** What the bar showed before an optimistic stop/discard, to put back on failure. */
interface RunningSnapshot {
  entry: TimeEntry;
  localStartTime: number | null;
}

interface StopVars {
  id: string;
  stop: string;
  snapshot: RunningSnapshot;
}

/**
 * The server's copy of a timer this tab started offline, once the queue has
 * replayed it: the running entry whose start matches the local clock's anchor.
 * The replayed create's response went to the replay loop, not to the tab, so
 * the tab never learned the real id any other way.
 */
async function findServerTwin(localStartTime: number | null): Promise<TimeEntry | null> {
  if (localStartTime === null) return null;
  try {
    const current = (await api.timeEntries.current()) as TimeEntry | null;
    if (current && Math.abs(Date.parse(current.start) - localStartTime) < 5_000) return current;
  } catch {
    // Still offline — nothing to find.
  }
  return null;
}

/**
 * After the offline queue drains, swap an offline-started timer's placeholder
 * for the entry the replay created, so edits and Stop reach it directly.
 * Called by useOfflineSync.
 */
export async function adoptReplayedTimer(): Promise<void> {
  const { runningEntry, localStartTime, setRunningEntry } = useTimerStore.getState();
  if (!runningEntry || !isOptimisticEntryId(runningEntry.id)) return;
  const twin = await findServerTwin(localStartTime);
  if (!twin || useTimerStore.getState().runningEntry?.id !== runningEntry.id) return;
  setRunningEntry(twin, localStartTime ?? undefined);
  await saveTimerState(timerStateOf(twin, localStartTime ?? Date.parse(twin.start)));
}

/**
 * An offline stop's receipt. The online one (announceStopped) flags an entry
 * with no project, but it runs on the server's reply, which an offline stop
 * doesn't get — and a stop on a train or at a client site is exactly where a
 * project-less hour is most likely. So the check runs on the local entry.
 */
function announceStoppedOffline(
  entry: TimeEntry,
  stopIso: string,
  keepRunning: { label: string; onClick: () => void }
) {
  const at = formatEntryTime(stopIso, useUIStore.getState().timeFormat);
  useUIStore.getState().flashEntry(entry.id);
  openKeepRunningWindow({ ...entry, stop: stopIso });
  toast.dismiss(OFFLINE_START_TOAST);
  if (!entry.projectId) {
    // Same shape as the online warning: its one action assigns a project (the
    // undo is the bar's pill). A timer that never reached the server has no
    // entry to open yet, so it gets no action rather than a different one.
    toast.warning(`Offline — stopped at ${at} with no project`, {
      id: STOP_RECEIPT_TOAST,
      description: "It can't be billed until it has one. Syncs when you reconnect.",
      duration: KEEP_RUNNING_MS,
      action: isOptimisticEntryId(entry.id)
        ? undefined
        : { label: "Assign project", onClick: () => useUIStore.getState().openEntryEditor(entry.id) },
    });
    return;
  }
  toast.info(`Offline — stopped at ${at}`, {
    id: STOP_RECEIPT_TOAST,
    description: "The entry will sync with that time when you reconnect.",
    duration: KEEP_RUNNING_MS,
    action: keepRunning,
  });
}

/** How long a stop can be taken back — the toasts and the bar's pill alike. */
export const KEEP_RUNNING_MS = 10_000;

/**
 * Every stop receipt shares one toast id: a new stop replaces the last
 * receipt instead of stacking, and Keep running closes it — the receipt used
 * to stay up saying "Saved…" (or "Offline — stopped at…") over a bar that was
 * running again.
 */
const STOP_RECEIPT_TOAST = "timer-stop-receipt";
/** The offline "timer is running" notice, closed once that timer stops. */
const OFFLINE_START_TOAST = "timer-offline-start";

function openKeepRunningWindow(entry: TimeEntry) {
  useTimerStore.getState().setLastStopped({ entry, until: Date.now() + KEEP_RUNNING_MS });
}

export function useTimer() {
  const { runningEntry, setRunningEntry, clearTimer } = useTimerStore();
  const queryClient = useQueryClient();

  // Optimistically drop the just-started entry into the cached time-entries
  // ranges that actually contain it, so it appears in the list immediately
  // instead of after the create round-trip — mirrors patchStopInCache below,
  // just for the opposite edge.
  const patchStartInCache = useCallback(
    (entry: TimeEntry) => {
      for (const [key, data] of queryClient.getQueriesData<TimeEntry[]>({
        queryKey: ["time-entries"],
      })) {
        if (!data || data.some((e) => e.id === entry.id)) continue;
        if (!rangeContains(key, entry.start)) continue;
        queryClient.setQueryData<TimeEntry[]>(key, [entry, ...data]);
      }
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
  // `start` is stamped once, in startTimer, and shared by the optimistic
  // placeholder and the request body: a start that sits in the offline queue
  // replays with the instant it was pressed, and the placeholder's clock
  // agrees with it to the millisecond.
  const startMutation = useMutation({
    mutationFn: async (partial: StartTimerInput & { start: string }) => {
      return api.timeEntries.create({
        description: partial.description ?? "",
        projectId: partial.projectId ?? null,
        taskId: partial.taskId ?? null,
        start: partial.start,
        // Passed through undefined rather than coerced to false: the server
        // reads "unspecified" as "inherit this project's billable flag"
        // (resolveBillable in routes/time-entries.ts). Coercing here is how
        // every API-started timer used to come out non-billable.
        billable: partial.billable,
        tags: partial.tags ?? [],
      }) as Promise<TimeEntry>;
    },
    onMutate: async (partial) => {
      // Release the just-stopped pin: once a new timer runs, ordering should be
      // running-group-first + reverse-chronological, not last-stopped-first.
      useUIStore.getState().clearPinnedEntry();
      // Starting over a timer that was itself started offline: the server's
      // "a new start stops the running one" can't reach an entry it has never
      // seen, so close the queued create here, before this start is queued
      // behind it.
      const previous = useTimerStore.getState().runningEntry;
      if (previous && isOptimisticEntryId(previous.id)) {
        await amendQueuedStart({ stop: partial.start });
      }
      const now = Date.parse(partial.start);
      const optimistic: TimeEntry = {
        id: `optimistic-${now}`,
        workspaceId: "default",
        description: partial.description ?? "",
        projectId: partial.projectId ?? null,
        projectName: null,
        projectColor: null,
        taskId: partial.taskId ?? null,
        taskName: null,
        start: partial.start,
        stop: null,
        duration: null,
        billable: partial.billable ?? false,
        tags: partial.tags ?? [],
        syncStatus: null,
        externalId: null,
        syncedAt: null,
        syncError: null,
        calendarEventId: null,
        createdAt: partial.start,
        updatedAt: partial.start,
      };
      setRunningEntry(optimistic, now);
      patchStartInCache(optimistic);
      return { optimisticId: optimistic.id };
    },
    onSuccess: async (entry, _partial, context) => {
      if (context) replaceInCache(context.optimisticId, entry);
      // A list refetch that was already in flight when the POST went out (a
      // focus refetch, a day rollover re-keying its range) resolves without
      // the new entry and overwrites the optimistic row. Reconcile once the
      // server has it; the row is already in the cache, so nothing flashes.
      void queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      // Stop is optimistic too, and can land before this response does. Only
      // adopt the server entry if the placeholder is still what's running —
      // otherwise this would bring a timer the user already stopped back.
      // The server's copy can also have arrived first, over the socket or a
      // resync — that is the same timer, not a replacement.
      const shown = useTimerStore.getState().runningEntry;
      if (!shown || (shown.id !== context?.optimisticId && shown.id !== entry.id)) return;
      setRunningEntry(entry, new Date(entry.start).getTime());
      await saveTimerState(timerStateOf(entry, new Date(entry.start).getTime()));
    },
    onError: (err, partial, context) => {
      if (isQueuedOffline(err)) {
        // The create is in the offline queue with the right start time, so
        // the timer IS running — say so and keep it, rather than clearing the
        // bar and letting the entry turn up later as a surprise.
        if (context && useTimerStore.getState().runningEntry?.id === context.optimisticId) {
          void saveTimerState(
            timerStateOf(useTimerStore.getState().runningEntry!, Date.parse(partial.start))
          );
        }
        toast.info("Offline — the timer is running and will sync when you reconnect", {
          id: OFFLINE_START_TOAST,
        });
        return;
      }
      if (context) removeFromCache(context.optimisticId);
      if (useTimerStore.getState().runningEntry?.id === context?.optimisticId) clearTimer();
      toast.error(mutationErrorMessage(err, "Couldn't start the timer"), {
        description: "Nothing was tracked. Try again.",
      });
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
      for (const [key, data] of queryClient.getQueriesData<TimeEntry[]>({
        queryKey: ["time-entries"],
      })) {
        if (!data) continue;
        if (data.some((e) => e.id === entry.id)) {
          queryClient.setQueryData<TimeEntry[]>(
            key,
            data.map((e) => (e.id === entry.id ? { ...e, stop: stopIso, duration } : e))
          );
        } else if (rangeContains(key, entry.start)) {
          // Not in this range's cache yet — prepend so the day total stays
          // continuous across the stop → refetch window.
          queryClient.setQueryData<TimeEntry[]>(key, [
            { ...entry, stop: stopIso, duration },
            ...data,
          ]);
        }
      }
    },
    [queryClient]
  );


  /**
   * Offer to close a task out, when there's reason to think it's finished.
   *
   * Deliberately **not** on every stop against a task. Stopping mid-task is the
   * common case, and a prompt there is noise that teaches you to dismiss the one
   * that matters. Two signals count as evidence: the estimate has been met, or
   * the task was due today or earlier. An undated, unestimated task says nothing
   * about its own completion, so nothing is asked — that direction of the loop is
   * carried by the checkbox on the row, and the opposite direction (ticked done
   * with no tracked time) is carried by useCompleteTask.
   */
  const offerTaskDone = useCallback(
    (entry: TimeEntry): boolean => {
      if (!entry.taskId) return false;
      let task: Task | undefined;
      for (const [, data] of queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] })) {
        const hit = data?.find((t) => t.id === entry.taskId);
        if (hit) { task = hit; break; }
      }
      if (!task || !task.active) return false;

      const today = todayLocalDate();
      const estimateMet =
        task.estimatedSeconds !== null && task.trackedSeconds >= task.estimatedSeconds;
      const dueNow = task.dueDate !== null && compareLocalDates(task.dueDate, today) <= 0;
      if (!estimateMet && !dueNow) return false;

      const target = task;
      toast(`Stopped ${formatDurationShort(entry.duration ?? 0)} on "${target.name}"`, {
        description: estimateMet
          ? `That's the whole ${formatDurationShort(target.estimatedSeconds!)} estimate.`
          : "This task was due today.",
        action: {
          label: "Mark done",
          onClick: () => {
            void (api.tasks.update(target.id, {
              active: false,
              completedOn: todayLocalDate(),
            }) as Promise<unknown>)
              .then(() => queryClient.invalidateQueries({ queryKey: ["tasks"] }))
              .catch(() => toast.error("Failed to update task"));
          },
        },
        id: STOP_RECEIPT_TOAST,
        duration: KEEP_RUNNING_MS,
      });
      return true;
    },
    [queryClient]
  );

  // ─── Keep running (undo a Stop) ──────────────────────────────────────────
  // Reopen a just-stopped entry as the running timer, from its original
  // start — as if Stop had never been pressed. Discard has always had a
  // confirm; a mis-stop had nothing, and recovering cost a Continue plus a
  // start-time edit. Only offered while nothing else is running.
  const reopenStopped = useCallback(
    (entry: TimeEntry) => {
      if (useTimerStore.getState().runningEntry) {
        toast.info("Another timer is running", { description: "Stop it first to reopen this one." });
        return;
      }
      useTimerStore.getState().setLastStopped(null);
      toast.dismiss(STOP_RECEIPT_TOAST);
      markActed();
      const reopened: TimeEntry = { ...entry, stop: null, duration: null };
      setRunningEntry(reopened, Date.parse(entry.start));
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) =>
        old?.map((e) => (e.id === entry.id ? reopened : e))
      );
      void saveTimerState(timerStateOf(reopened, Date.parse(entry.start)));
      // Started and stopped without a connection: there is no server entry to
      // reopen, only a queued create — take its stop back off.
      if (isOptimisticEntryId(entry.id)) {
        void reopenQueuedCreate(entry.start).then((ok) => {
          if (ok) {
            toast.info("Offline — the timer is running again and will sync when you reconnect");
            return;
          }
          if (useTimerStore.getState().runningEntry?.id === entry.id) clearTimer();
          void clearTimerState();
          toast.error("Couldn't reopen the timer", { description: "It has already synced as stopped." });
        });
        return;
      }
      void (api.timeEntries.update(entry.id, { stop: null }) as Promise<TimeEntry>)
        .then((updated) => {
          if (useTimerStore.getState().runningEntry?.id === updated.id) {
            setRunningEntry(updated, Date.parse(updated.start));
          }
          invalidateEntryDerived(queryClient);
        })
        .catch((err: unknown) => {
          if (isQueuedOffline(err)) {
            toast.info("Offline — the timer is running again and will sync when you reconnect");
            return;
          }
          if (useTimerStore.getState().runningEntry?.id === entry.id) clearTimer();
          void clearTimerState();
          invalidateEntryDerived(queryClient);
          toast.error("Couldn't reopen the timer", {
            description: "The entry is still stopped.",
          });
        });
    },
    [queryClient, setRunningEntry, clearTimer]
  );

  // Every stop closes with a receipt: what was saved, and — on the plain one —
  // "Keep running" to take it back. The warning and task toasts carry their
  // own action instead: two buttons squeezed the text into five lines, and
  // the undo is in the bar beside the disc (and on Alt+Shift+R) for the same
  // ten seconds after every stop. The row also flashes and floats to the
  // top of its day. An entry that landed with no project is the one worth
  // raising — for a consultant that's an unbillable hour, and nothing else in
  // the UI would ever point it out — so it takes the warning form.
  const announceStopped = useCallback((entry: TimeEntry | undefined) => {
    if (!entry) return;
    useUIStore.getState().flashEntry(entry.id);
    openKeepRunningWindow(entry);
    const keepRunning = { label: "Keep running", onClick: () => reopenStopped(entry) };
    if (!entry.projectId) {
      toast.warning(`Stopped ${formatDurationShort(entry.duration ?? 0)} with no project`, {
        id: STOP_RECEIPT_TOAST,
        description: "It can't be billed until it has one.",
        duration: KEEP_RUNNING_MS,
        action: {
          label: "Assign project",
          onClick: () => useUIStore.getState().openEntryEditor(entry.id),
        },
      });
      return;
    }
    if (offerTaskDone(entry)) return;
    toast(`Saved ${formatDurationShort(entry.duration ?? 0)}${entry.projectName ? ` to ${entry.projectName}` : ""}`, {
      id: STOP_RECEIPT_TOAST,
      duration: KEEP_RUNNING_MS,
      action: keepRunning,
    });
  }, [offerTaskDone, reopenStopped]);

  // ─── Stop timer ──────────────────────────────────────────────────────────
  // One mutation for every stop — the disc, the hotkey, and "stop at" from the
  // idle dialog — and it always carries the instant: the server records the
  // time the user stopped, not the time the request (or its offline replay)
  // arrived. The optimistic half runs in `commitStop`, before the id settles.
  const stopMutation = useMutation({
    mutationFn: ({ id, stop }: StopVars) =>
      api.timeEntries.stop(id, stop) as Promise<TimeEntry>,
    onSuccess: (entry) => {
      void clearTimerState();
      invalidateEntryDerived(queryClient);
      announceStopped(entry);
    },
    onError: (err, vars) => {
      if (isQueuedOffline(err)) {
        void clearTimerState();
        announceStoppedOffline(vars.snapshot.entry, vars.stop, {
          label: "Keep running",
          onClick: () => reopenStopped({ ...vars.snapshot.entry, stop: vars.stop }),
        });
        return;
      }
      // The server entry is still running. Put the bar back so the Stop
      // control is on screen again — the old toast said "try again" over an
      // idle bar that had nothing to try with.
      restoreRunning(vars.snapshot);
      toast.error("Couldn't stop the timer — it's still running", {
        description: mutationErrorMessage(err, "The request didn't reach the server."),
        action: { label: "Try again", onClick: () => commitStopRef.current(vars.stop) },
      });
    },
  });

  // ─── Discard timer ───────────────────────────────────────────────────────
  const discardMutation = useMutation({
    mutationFn: ({ id }: { id: string; snapshot: RunningSnapshot }) =>
      api.timeEntries.delete(id),
    onSuccess: () => {
      void clearTimerState();
      // The discarded entry is gone from the day's list and from every total
      // derived from it; nothing was invalidated here before, so the row it
      // left behind lingered until the next focus refetch.
      invalidateEntryDerived(queryClient);
    },
    onError: (err, vars) => {
      if (isQueuedOffline(err)) {
        void clearTimerState();
        toast.info("Offline — the timer will be discarded when you reconnect");
        return;
      }
      restoreRunning(vars.snapshot);
      toast.error("Couldn't discard the timer — it's still running");
    },
  });

  // Put a timer the server still has running back on screen: the store, and a
  // refetch to undo the optimistic "completed" patch in the entries cache.
  const restoreRunning = useCallback(
    (snapshot: RunningSnapshot) => {
      if (useTimerStore.getState().runningEntry) return;
      setRunningEntry(snapshot.entry, snapshot.localStartTime ?? undefined);
      void queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    [queryClient, setRunningEntry]
  );

  // ─── Edit elapsed ────────────────────────────────────────────────────────
  // Set the running timer's elapsed time to `seconds` by shifting its start
  // back to `now - seconds`; the timer keeps ticking from the new value.
  // setRunningEntry derives the displayed elapsed from the new start, so no
  // separate setElapsed call is needed to avoid a flash.
  const editElapsedMutation = useMutation({
    mutationFn: ({ id, seconds }: { id: string; seconds: number }) => {
      const newStart = Date.now() - seconds * 1000;
      return api.timeEntries.update(id, {
        start: new Date(newStart).toISOString(),
      }) as Promise<TimeEntry>;
    },
    onMutate: async ({ seconds }) => {
      if (!runningEntry) return;
      const previousStart = useTimerStore.getState().localStartTime;
      const newStart = Date.now() - seconds * 1000;
      setRunningEntry(runningEntry, newStart);
      await saveTimerState(timerStateOf(runningEntry, newStart));
      return { previousStart };
    },
    // Put the anchor back. This used to invalidate `timer-current`, a key no
    // query has ever read, so a rejected edit left the optimistic elapsed on
    // screen — and in IndexedDB — with only the toast to say otherwise.
    onError: (_err, _seconds, context) => {
      toast.error("Failed to update timer");
      const previousStart = context?.previousStart;
      if (!runningEntry || previousStart == null) return;
      setRunningEntry(runningEntry, previousStart);
      void saveTimerState(timerStateOf(runningEntry, previousStart));
    },
  });

  const startTimer = useCallback(
    (partial: StartTimerInput & { start?: string } = {}) => {
      const start = partial.start ?? new Date().toISOString();
      // Every surface that starts a timer — the bar, a row's Continue, a
      // favourite, the palette — would silently stop the running one if it
      // fired before the page knows one exists. The window is the mount
      // restore (see TimerStore.restoring); a start inside it is held, with
      // its instant, and applied by useTimerLifecycle only if nothing turns
      // out to be running.
      const { restoring, runningEntry: running, setDeferredStart } = useTimerStore.getState();
      if (restoring && !running) {
        setDeferredStart({ ...partial, start });
        return;
      }
      // mutateAsync so a stop or edit that lands before the request settles
      // can wait for the real id (lib/pendingStart); onError handles rejection.
      markActed();
      useTimerStore.getState().setLastStopped(null);
      const input = { ...partial };
      delete input.fromBar;
      trackPendingStart(startMutation.mutateAsync({ ...input, start }));
    },
    [startMutation]
  );

  /**
   * Stop the running timer at `stopIso`. The bar goes idle and the day's
   * totals close *now*; the id is resolved afterwards. A timer started offline
   * has no server id to stop, so its queued create is closed instead — and if
   * the queue drained in the meantime, the entry it created is looked up.
   */
  const commitStop = useCallback(
    (stopIso: string) => {
      const { runningEntry: entry, localStartTime } = useTimerStore.getState();
      if (!entry) return;
      markActed();
      const snapshot: RunningSnapshot = { entry, localStartTime };
      patchStopInCache(stopIso);
      clearTimer();
      void (async () => {
        const id = await settleEntryId(entry.id);
        if (id) {
          stopMutation.mutate({ id, stop: stopIso, snapshot });
          return;
        }
        if (!isOptimisticEntryId(entry.id)) return;
        const outcome = await amendQueuedStart({ stop: stopIso });
        if (outcome !== "none") {
          void clearTimerState();
          if (outcome === "removed") removeFromCache(entry.id);
          else
            announceStoppedOffline(entry, stopIso, {
              label: "Keep running",
              onClick: () => reopenStopped({ ...entry, stop: stopIso }),
            });
          return;
        }
        const twin = await findServerTwin(localStartTime);
        if (twin) stopMutation.mutate({ id: twin.id, stop: stopIso, snapshot });
        // Otherwise the start never reached anywhere, and its own onError has
        // already said so.
      })();
    },
    [patchStopInCache, clearTimer, stopMutation, removeFromCache, reopenStopped]
  );
  const commitStopRef = useRef(commitStop);
  useEffect(() => {
    commitStopRef.current = commitStop;
  });

  const stopTimer = useCallback(() => commitStop(new Date().toISOString()), [commitStop]);

  // Stop the running timer at an explicit ISO time (e.g. trim idle time back to
  // when the user went away).
  const stopTimerAt = useCallback((iso: string) => commitStop(iso), [commitStop]);

  const discardTimer = useCallback(() => {
    const { runningEntry: entry, localStartTime } = useTimerStore.getState();
    if (!entry) return;
    markActed();
    const snapshot: RunningSnapshot = { entry, localStartTime };
    clearTimer();
    removeFromCache(entry.id);
    void (async () => {
      const id = await settleEntryId(entry.id);
      if (id) {
        discardMutation.mutate({ id, snapshot });
        return;
      }
      if (!isOptimisticEntryId(entry.id)) return;
      if ((await amendQueuedStart(null)) !== "none") {
        void clearTimerState();
        return;
      }
      const twin = await findServerTwin(localStartTime);
      if (twin) discardMutation.mutate({ id: twin.id, snapshot });
    })();
  }, [clearTimer, removeFromCache, discardMutation]);

  const editElapsed = useCallback(
    (seconds: number) => {
      if (!runningEntry || seconds < 0) return;
      void settleEntryId(runningEntry.id).then(async (id) => {
        if (id) {
          editElapsedMutation.mutate({ id, seconds });
          return;
        }
        // Started offline: move the queued create's start, and the clock.
        if (!isOptimisticEntryId(runningEntry.id)) return;
        const newStart = Date.now() - seconds * 1000;
        if ((await amendQueuedStart({ start: new Date(newStart).toISOString() })) === "none") return;
        setRunningEntry(runningEntry, newStart);
        await saveTimerState(timerStateOf(runningEntry, newStart));
      });
    },
    [runningEntry, editElapsedMutation, setRunningEntry]
  );

  /** Reopen the last stopped entry, if its Keep running window is still open. */
  const keepRunning = useCallback(() => {
    const last = useTimerStore.getState().lastStopped;
    if (!last || Date.now() > last.until) return false;
    reopenStopped(last.entry);
    return true;
  }, [reopenStopped]);

  return {
    startTimer,
    keepRunning,
    stopTimer,
    stopTimerAt,
    discardTimer,
    editElapsed,
  };
}

// The global, once-per-app parts of the timer: the 1s tick loop/tab title,
// restoring a running entry from the server (+ IDB fallback) on mount, and
// the Alt+Shift+S/X keyboard shortcuts. useTimer() itself is a plain hook
// re-instantiated by every component that calls it (EntryRow, FavoritesMenu,
// CommandPalette, etc. all need its action functions) — mounting these
// effects there too would fire the mount-restore fetch and register the
// hotkeys once per consumer, each independently resetting the running
// entry's elapsed time, which is exactly what produced the visible
// 00:00:00-flickers-a-few-times bug on a hard refresh. Call this hook
// exactly once, from TimerBar (always mounted).
export function useTimerLifecycle(
  draft?: StartTimerInput,
  opts?: {
    /** Runs just before the hotkey starts or stops, so the bar can note where focus was. */
    onBeforeToggle?: () => void;
    /** Put text into the bar's description field (which then saves it). */
    onUseDescription?: (text: string) => void;
  }
) {
  const onBeforeToggleRef = useRef(opts?.onBeforeToggle);
  const onUseDescriptionRef = useRef(opts?.onUseDescription);
  useEffect(() => {
    onBeforeToggleRef.current = opts?.onBeforeToggle;
    onUseDescriptionRef.current = opts?.onUseDescription;
  });
  const { runningEntry, localStartTime, setElapsed, setRunningEntry } = useTimerStore();
  const { startTimer, stopTimer, keepRunning } = useTimer();

  // The hotkey fires from outside React's render cycle, so it needs the last
  // *painted* draft — which is also what the user can see on screen when they
  // press the keys. Kept in a ref so the shortcut isn't re-registered on every
  // keystroke in the description field.
  const draftRef = useRef<StartTimerInput>({});
  useEffect(() => {
    draftRef.current = draft ?? {};
  });

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
        // The user acted while this was in flight; its answer predates that.
        // What's on screen is theirs, and the socket and the next refetch
        // reconcile anything the server knows beyond it.
        if (useTimerStore.getState().restoreSuperseded) return;
        // The server can be behind this tab's own queue on a reload that
        // lands before the offline queue drains: an entry stopped or discarded
        // offline still reads as running there, and a timer started offline
        // isn't there at all. The queue is the more recent truth.
        const pending = await getPendingMutations().catch(() => []);
        if (cancelled) return;
        const closedLocally =
          current !== null &&
          pending.some(
            (m) =>
              m.url.includes(`/time_entries/${current.id}`) &&
              (m.method === "DELETE" || m.url.endsWith("/stop") || Boolean((m.body as { stop?: unknown } | undefined)?.stop))
          );
        if (closedLocally) {
          // The store may have been seeded running from the mirror.
          useTimerStore.getState().clearTimer();
          await clearTimerState();
          return;
        }
        if (!current && saved && isOptimisticEntryId(saved.entryId) && (await hasQueuedRunningCreate())) {
          if (cancelled) return;
          setRunningEntry(entryFromTimerState(saved), saved.startedAt);
          return;
        }
        if (current) {
          // Running entry on server — restore regardless of IDB state
          const localStartTime = saved?.entryId === current.id
            ? new Date(saved.startedAt).getTime()
            : new Date(current.start).getTime();
          setRunningEntry(current, localStartTime);
          await saveTimerState(timerStateOf(current, localStartTime));
        } else {
          // Nothing running on server — clear any stale state, including a
          // running bar seeded from the mirror (stopped on another device).
          useTimerStore.getState().clearTimer();
          await clearTimerState();
        }
      } catch {
        // Offline — fall back to IDB if available
        if (saved) setRunningEntry(entryFromTimerState(saved), saved.startedAt);
      } finally {
        // Answered or failed, the bar now knows as much as it's going to.
        if (!cancelled) useTimerStore.getState().setRestored();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setRunningEntry]);

  // ─── Persist whatever is running ─────────────────────────────────────────
  // The explicit saves in useTimer cover the timers this tab starts; a timer
  // adopted from another tab, a resync or an edit elsewhere reached the store
  // without ever being written down, so a reload came back idle. Clearing
  // stays explicit (stop/discard success, offline stop), because an
  // optimistic stop must not forget a timer the server may yet refuse to stop.
  useEffect(
    () =>
      useTimerStore.subscribe((state, prev) => {
        const entry = state.runningEntry;
        if (!entry || state.localStartTime === null) return;
        if (entry === prev.runningEntry && state.localStartTime === prev.localStartTime) return;
        void saveTimerState(timerStateOf(entry, state.localStartTime));
      }),
    []
  );

  // ─── The entries list knows first ────────────────────────────────────────
  // With no local mirror (a first visit, a private window, another device's
  // timer), the bar waited on `/current` while the entries list above it —
  // a different request that often lands first — was already drawing the
  // running row and the ribbon's live segment. Adopt the running entry from
  // the list the moment it arrives; `/current` still has the final word.
  const queryClient = useQueryClient();
  useEffect(() => {
    const adopt = () => {
      const state = useTimerStore.getState();
      if (!state.restoring || state.runningEntry || state.restoreSuperseded) return;
      for (const [, data] of queryClient.getQueriesData<TimeEntry[]>({
        queryKey: ["time-entries"],
      })) {
        const running = data?.find((e) => e.stop === null && !isOptimisticEntryId(e.id));
        if (running) {
          state.setRunningEntry(running, Date.parse(running.start));
          return;
        }
      }
    };
    adopt();
    return queryClient.getQueryCache().subscribe(adopt);
  }, [queryClient]);

  // ─── A start pressed during the restore ──────────────────────────────────
  // Applied once the restore has answered. If a timer turned out to be
  // running, the press was made against a bar that didn't know that — say so
  // rather than start over it (which would have stopped it).
  const restoring = useTimerStore((s) => s.restoring);
  const deferredStart = useTimerStore((s) => s.deferredStart);
  useEffect(() => {
    if (restoring || !deferredStart) return;
    const { runningEntry: running, setDeferredStart } = useTimerStore.getState();
    setDeferredStart(null);
    if (running) {
      // What was typed is the user's words about what they're doing; don't
      // just let the running entry's text replace it. Offer to put it on the
      // timer that is actually running.
      const typed = deferredStart.description?.trim();
      const runningId = running.id;
      toast.info("A timer was already running", {
        description: typed
          ? `It's still going. "${typed}" wasn't started.`
          : "It's still going — nothing new was started.",
        action:
          typed && typed !== running.description.trim()
            ? {
                label: "Use as its description",
                // Through the bar's own field, so its debounced save writes
                // it and the field shows it — setting the entry underneath
                // would leave the field on the old text.
                onClick: () => {
                  if (useTimerStore.getState().runningEntry?.id === runningId) {
                    onUseDescriptionRef.current?.(typed);
                  }
                },
              }
            : undefined,
      });
      return;
    }
    startTimer(
      deferredStart.fromBar
        ? { ...draftRef.current, start: deferredStart.start }
        : deferredStart
    );
  }, [restoring, deferredStart, startTimer]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────
  // `enableOnFormTags` is not optional here: react-hotkeys-hook skips form
  // elements by default, so this shortcut did nothing in the description input
  // — the field the user is in every time they are about to start a timer.
  // And `getDraft` is what it starts: calling `startTimer()` bare began a
  // blank, project-less, non-billable entry, then the bar's running-entry sync
  // overwrote the typed description and picked project from that empty entry.
  // The advertised shortcut destroyed the work it was meant to commit.
  useHotkeys(
    "alt+shift+s",
    () => {
      onBeforeToggleRef.current?.();
      if (runningEntry) stopTimer();
      else startTimer({ ...draftRef.current, fromBar: true });
    },
    { preventDefault: true, enableOnFormTags: ["INPUT", "TEXTAREA"] },
    [runningEntry, stopTimer, startTimer]
  );
  // Take back the last Stop while its window is open (the pill beside the
  // disc and the receipt toast say the same thing).
  useHotkeys(
    "alt+shift+r",
    () => {
      if (runningEntry) return;
      onBeforeToggleRef.current?.();
      keepRunning();
    },
    { preventDefault: true, enableOnFormTags: ["INPUT", "TEXTAREA"] },
    [runningEntry, keepRunning]
  );
  // Routes through the same confirm dialog as the trash-icon button (owned by
  // TimerBar, opened via the shared uiStore flag) rather than discarding
  // straight away — a stray keypress shouldn't silently delete tracked time.
  useHotkeys(
    "alt+shift+x",
    () => {
      if (runningEntry) useUIStore.getState().setDiscardConfirmOpen(true);
    },
    { preventDefault: true, enableOnFormTags: ["INPUT", "TEXTAREA"] },
    [runningEntry]
  );
}
