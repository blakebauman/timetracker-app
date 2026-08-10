import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { formatDayHeader } from "@/lib/dateUtils";
import type {
  TimeEntry,
  CreateTimeEntry,
  UpdateTimeEntry,
  EntrySuggestion,
} from "@shared/schemas";
import { startOfDay, subDays, endOfDay } from "date-fns";

export function useEntries(days = 30) {
  const since = startOfDay(subDays(new Date(), days - 1)).toISOString();
  const until = endOfDay(new Date()).toISOString();

  return useQuery({
    queryKey: ["time-entries", since, until],
    queryFn: () => api.timeEntries.list({ since, until }) as Promise<TimeEntry[]>,
  });
}

// Fetch entries within an explicit [since, until) range — used by the calendar,
// which navigates to arbitrary weeks/days (the anchored-to-today `useEntries`
// can't reach future or custom ranges). Shares the ["time-entries", …] key
// prefix so create/update/delete invalidations and the WebSocket `entries:changed`
// handler keep it in sync automatically.
export function useEntriesRange(sinceIso: string, untilIso: string) {
  return useQuery({
    queryKey: ["time-entries", sinceIso, untilIso],
    queryFn: () =>
      api.timeEntries.list({ since: sinceIso, until: untilIso }) as Promise<TimeEntry[]>,
  });
}

// Autocomplete candidates for the timer bar's description input. Deliberately
// keyed outside the ["time-entries", …] prefix: the running timer saves its
// description on an 800 ms debounce, and sharing the prefix would refetch the
// whole suggestion set on every few keystrokes.
export function useEntrySuggestions() {
  return useQuery({
    queryKey: ["entry-suggestions"],
    queryFn: () => api.timeEntries.suggestions() as Promise<EntrySuggestion[]>,
    staleTime: 5 * 60 * 1000,
  });
}

export interface DescriptionGroup {
  key: string; // `${description}__${projectId ?? ""}`
  /**
   * React key for the group and its single-entry row form.
   *
   * Deliberately NOT `key`: that one is derived from description + projectId,
   * i.e. from two fields the row itself edits inline. Keying the DOM by it meant
   * every rename or project assignment changed the key mid-mutation — the row
   * unmounted on the optimistic patch and remounted as a "new" row, which
   * replayed the entrance animation, dropped the per-mutation `onSuccess`
   * callbacks (so the Saved tick never fired and the edit sheet reopened), and
   * reset the row's local editing state.
   *
   * The oldest member's id instead: stable across content edits, and stable when
   * a sibling leaves the group.
   */
  anchorId: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  entries: TimeEntry[];
  totalSeconds: number;
  billable: boolean;
}

export interface DayGroup {
  dateKey: string;
  label: string;
  groups: DescriptionGroup[];
  totalSeconds: number;
}

// Pure grouping: buckets entries by day (desc), then sub-groups each day by
// description + projectId. Shared by the anchored-to-today `useGroupedEntries`
// and the range-scoped `useGroupedEntriesRange`.
export function groupEntriesByDay(
  entries: TimeEntry[],
  /** Sorted to the top of its day group so a just-stopped entry is findable. */
  pinnedEntryId?: string | null
): DayGroup[] {
  const grouped = entries.reduce(
    (acc, entry) => {
      const dayKey = entry.start.slice(0, 10);
      if (!acc[dayKey]) acc[dayKey] = [];
      acc[dayKey].push(entry);
      return acc;
    },
    {} as Record<string, TimeEntry[]>
  );

  return Object.keys(grouped)
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => {
      const dayEntries = grouped[dateKey];

      // Sub-group by description + projectId
      const descMap = new Map<string, TimeEntry[]>();
      for (const e of dayEntries) {
        const k = `${e.description}__${e.projectId ?? ""}`;
        const existing = descMap.get(k);
        if (existing) existing.push(e);
        else descMap.set(k, [e]);
      }

      const groups: DescriptionGroup[] = [...descMap.values()]
        .map((grpEntries) => ({
          key: `${grpEntries[0].description}__${grpEntries[0].projectId ?? ""}`,
          // Earliest member anchors the group's identity (see `anchorId`).
          // Computed rather than taken by position so it doesn't depend on the
          // order the list endpoint happened to return.
          anchorId: grpEntries.reduce((oldest, e) =>
            e.start < oldest.start || (e.start === oldest.start && e.id < oldest.id) ? e : oldest
          ).id,
          description: grpEntries[0].description,
          projectId: grpEntries[0].projectId,
          projectName: grpEntries[0].projectName,
          projectColor: grpEntries[0].projectColor,
          entries: [...grpEntries].sort((a, b) => b.start.localeCompare(a.start)),
          totalSeconds: grpEntries.reduce((s, e) => s + (e.duration ?? 0), 0),
          billable: grpEntries.some((e) => e.billable),
        }))
        .sort((a, b) => {
          // The actively running entry's group always leads its day — resuming
          // work later in the day must bring its whole group back to the top.
          const aRunning = a.entries.some((e) => e.stop === null);
          const bRunning = b.entries.some((e) => e.stop === null);
          if (aRunning !== bRunning) return aRunning ? -1 : 1;
          // The just-stopped entry floats to the top of its day; everything else
          // stays in reverse-chronological order.
          if (pinnedEntryId) {
            const aPinned = a.entries.some((e) => e.id === pinnedEntryId);
            const bPinned = b.entries.some((e) => e.id === pinnedEntryId);
            if (aPinned !== bPinned) return aPinned ? -1 : 1;
          }
          return b.entries[0].start.localeCompare(a.entries[0].start);
        });

      return {
        dateKey,
        label: formatDayHeader(dateKey + "T00:00:00"),
        groups,
        totalSeconds: dayEntries.reduce((sum, e) => sum + (e.duration ?? 0), 0),
      };
    });
}

export function useGroupedEntries(days = 30) {
  const { data: entries = [], ...rest } = useEntries(days);
  return { days: groupEntriesByDay(entries), entries, ...rest };
}

// Range-scoped variant used by the period-navigable timer list.
export function useGroupedEntriesRange(sinceIso: string, untilIso: string) {
  const { data: entries = [], ...rest } = useEntriesRange(sinceIso, untilIso);
  const pinnedEntryId = useUIStore((s) => s.pinnedEntryId);
  return { days: groupEntriesByDay(entries, pinnedEntryId), entries, ...rest };
}

/**
 * An edit that never reached the network was still persisted for replay (see
 * `ApiError.queued`). Rolling it back would show the user their correction being
 * undone and a "Failed to update" toast — and then, minutes later, silently
 * reapply it when the queue drains. Keep the optimistic value on screen and say
 * what's actually true.
 */
function isQueuedOffline(err: unknown): err is ApiError {
  return err instanceof ApiError && err.queued;
}

/** The generic fallback only when the server didn't say something more useful. */
function mutationErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status >= 400 && err.message ? err.message : fallback;
}

/**
 * Entries changed, so anything derived from them is stale.
 *
 * `entry-suggestions` is deliberately outside the `time-entries` prefix, so a
 * prefix invalidate never reaches it and a renamed entry kept being offered
 * under its old text by the autocomplete. But it is outside that prefix for a
 * reason — the running timer saves its description on an 800 ms debounce, and
 * refetching the whole suggestion set every few keystrokes is exactly what that
 * separation exists to prevent. So it refreshes only when a caller says the
 * change was one the suggestion set can see.
 */
function invalidateEntryDerived(queryClient: QueryClient, suggestions = false) {
  queryClient.invalidateQueries({ queryKey: ["time-entries"] });
  queryClient.invalidateQueries({ queryKey: ["reports"] });
  if (suggestions) queryClient.invalidateQueries({ queryKey: ["entry-suggestions"] });
}

/** The rows an optimistic mutation is about to touch, and the caches holding them. */
interface EntrySnapshot {
  rows: Map<string, TimeEntry>;
  keys: QueryKey[];
}

/**
 * Capture just the rows a mutation will change — not the whole cache.
 *
 * Every entry mutation used to snapshot all of `["time-entries"]` in `onMutate`
 * and restore it wholesale on failure. That reverts more than the failed edit:
 * anything else that succeeded while it was in flight was inside the snapshot
 * too, so a rejected edit silently undid a *successful* one. Recording the
 * affected rows and their query keys lets the rollback put back exactly what it
 * took, and leave everything else alone.
 */
function snapshotEntries(queryClient: QueryClient, ids: Set<string>): EntrySnapshot {
  const rows = new Map<string, TimeEntry>();
  const keys: QueryKey[] = [];
  for (const [key, data] of queryClient.getQueriesData<TimeEntry[]>({
    queryKey: ["time-entries"],
  })) {
    if (!data?.some((e) => ids.has(e.id))) continue;
    keys.push(key);
    for (const e of data) if (ids.has(e.id) && !rows.has(e.id)) rows.set(e.id, e);
  }
  return { rows, keys };
}

/**
 * Put the snapshotted rows back, into exactly the caches they came from.
 *
 * Handles both shapes of rollback: a changed row is replaced in place, and a
 * row an optimistic delete removed is re-inserted. Re-inserted rows are sorted
 * newest-first to match the list endpoint's `ORDER BY te.start DESC`, so the
 * restored array is ordered the way a refetch would return it.
 */
function rollbackEntries(queryClient: QueryClient, snap: EntrySnapshot | undefined) {
  if (!snap) return;
  for (const key of snap.keys) {
    queryClient.setQueryData<TimeEntry[]>(key, (old) => {
      if (!old) return old;
      const restored = old.map((e) => snap.rows.get(e.id) ?? e);
      const missing = [...snap.rows.values()].filter((r) => !old.some((e) => e.id === r.id));
      if (!missing.length) return restored;
      return [...restored, ...missing].sort((a, b) => b.start.localeCompare(a.start));
    });
  }
}

/**
 * Apply a patch to a cached row, resolving the denormalized columns the list
 * renders from so a reassignment shows the new project/task immediately rather
 * than the old label until the refetch lands.
 *
 * Shared by the single and bulk update paths — they take the same field set
 * (bulk simply can't move start/stop).
 */
function mergeEntryPatch(
  queryClient: QueryClient,
  entry: TimeEntry,
  patch: Partial<TimeEntry> & { projectId?: string | null; taskId?: string | null }
): TimeEntry {
  const merged: TimeEntry = { ...entry, ...patch };
  if (patch.projectId !== undefined) {
    const proj = queryClient
      .getQueryData<{ id: string; name: string; color: string | null }[]>(["projects"])
      ?.find((p) => p.id === patch.projectId);
    merged.projectName = proj?.name ?? null;
    merged.projectColor = proj?.color ?? null;
  }
  if (patch.taskId !== undefined) {
    // Tasks are cached per project (`["tasks", projectId, "withDone"]`), so the
    // lookup has to sweep the prefix rather than read one key.
    const task = queryClient
      .getQueriesData<{ id: string; name: string }[]>({ queryKey: ["tasks"] })
      .flatMap(([, rows]) => rows ?? [])
      .find((t) => t.id === patch.taskId);
    merged.taskName = task?.name ?? null;
  }
  // Duration is recomputed with Math.round to match the server's
  // `* 86400 + 0.5`, so an exact 30m span never flickers as 29m.
  if ((patch.start !== undefined || patch.stop !== undefined) && merged.start && merged.stop) {
    merged.duration = Math.round(
      (new Date(merged.stop).getTime() - new Date(merged.start).getTime()) / 1000
    );
  }
  return merged;
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTimeEntry) =>
      api.timeEntries.create(data as unknown as Record<string, unknown>) as Promise<TimeEntry>,
    onSuccess: () => {
      toast.success("Entry added");
      invalidateEntryDerived(queryClient, true);
    },
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info("Offline — the entry will be added when you reconnect")
        : toast.error(mutationErrorMessage(err, "Failed to add entry")),
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTimeEntry }) =>
      api.timeEntries.update(id, data as Record<string, unknown>) as Promise<TimeEntry>,
    // Optimistically patch the cached entry so inline edits (duration, description,
    // project, billable) land instantly instead of after the round-trip.
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["time-entries"] });
      const snap = snapshotEntries(queryClient, new Set([id]));
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) =>
        old?.map((e) =>
          e.id === id ? mergeEntryPatch(queryClient, e, data as Partial<TimeEntry>) : e
        )
      );
      return { snap };
    },
    onError: (err, _vars, ctx) => {
      if (isQueuedOffline(err)) {
        // Keep the optimistic value — the write is queued, not lost.
        toast.info("Offline — your change will sync when you reconnect");
        return;
      }
      rollbackEntries(queryClient, ctx?.snap);
      toast.error(mutationErrorMessage(err, "Failed to update entry"));
    },
    onSuccess: (updated) => {
      // Keep the live timer (bar + sidebar) in sync when the edit targets the
      // currently running entry — e.g. assigning a project from the entries
      // list. setFromWS merges same-id entries without resetting elapsed.
      const timer = useTimerStore.getState();
      if (updated && timer.runningEntry && updated.id === timer.runningEntry.id) {
        timer.setFromWS(updated);
      }
      // Write the server's row straight into every cached range that holds it.
      // The invalidate in onSettled still refetches, but this makes the authoritative
      // values (duration rounding, tag ids, syncStatus) visible on the next frame
      // rather than after a round-trip the user can watch.
      if (updated) {
        queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) =>
          old?.map((e) => (e.id === updated.id ? updated : e))
        );
      }
    },
    // Refetch on failure too: a rejected edit may have been rejected against
    // state this client hasn't seen yet.
    onSettled: (_data, err, vars) => {
      if (isQueuedOffline(err)) return;
      // Renaming a completed entry changes what autocomplete should offer.
      // A running entry's description is still being typed — that's the debounce
      // case the suggestion cache is kept separate for.
      const renamedCompleted =
        vars.data.description !== undefined &&
        useTimerStore.getState().runningEntry?.id !== vars.id;
      invalidateEntryDerived(queryClient, renamedCompleted);
    },
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.timeEntries.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["time-entries"] });
      const snap = snapshotEntries(queryClient, new Set([id]));
      queryClient.setQueriesData<TimeEntry[]>(
        { queryKey: ["time-entries"] },
        (old) => old?.filter((e) => e.id !== id) ?? []
      );
      return { snap };
    },
    onError: (err, _id, ctx) => {
      if (isQueuedOffline(err)) {
        toast.info("Offline — the deletion will sync when you reconnect");
        return;
      }
      rollbackEntries(queryClient, ctx?.snap);
      toast.error(mutationErrorMessage(err, "Failed to delete entry"));
    },
    onSettled: (_data, err) => {
      if (isQueuedOffline(err)) return;
      invalidateEntryDerived(queryClient, true);
    },
  });
}

export function useBulkDeleteEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.timeEntries.bulkDelete(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ["time-entries"] });
      const set = new Set(ids);
      const snap = snapshotEntries(queryClient, set);
      queryClient.setQueriesData<TimeEntry[]>(
        { queryKey: ["time-entries"] },
        (old) => old?.filter((e) => !set.has(e.id)) ?? []
      );
      return { snap };
    },
    onError: (err, _ids, ctx) => {
      if (isQueuedOffline(err)) {
        toast.info("Offline — the deletions will sync when you reconnect");
        return;
      }
      rollbackEntries(queryClient, ctx?.snap);
      toast.error(mutationErrorMessage(err, "Failed to delete entries"));
    },
    onSettled: (_data, err) => {
      if (isQueuedOffline(err)) return;
      invalidateEntryDerived(queryClient, true);
    },
  });
}

export function useBulkUpdateEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: Record<string, unknown> }) =>
      api.timeEntries.bulkUpdate({ ids, patch }),
    // This was the one entry mutation with no optimistic path: assigning a
    // project to a whole group, or flipping billable across a selection, sat
    // there doing nothing for a round-trip while every single-entry equivalent
    // landed instantly. Same merge as useUpdateEntry — bulk takes the same
    // fields, it just can't move start/stop.
    onMutate: async ({ ids, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["time-entries"] });
      const set = new Set(ids);
      const snap = snapshotEntries(queryClient, set);
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) =>
        old?.map((e) =>
          set.has(e.id) ? mergeEntryPatch(queryClient, e, patch as Partial<TimeEntry>) : e
        )
      );
      return { snap };
    },
    onError: (err, _vars, ctx) => {
      if (isQueuedOffline(err)) {
        toast.info("Offline — your changes will sync when you reconnect");
        return;
      }
      rollbackEntries(queryClient, ctx?.snap);
      toast.error(mutationErrorMessage(err, "Failed to update entries"));
    },
    onSettled: (_data, err, vars) => {
      if (isQueuedOffline(err)) return;
      invalidateEntryDerived(queryClient, vars.patch.description !== undefined);
    },
  });
}
