import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
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

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTimeEntry) =>
      api.timeEntries.create(data as unknown as Record<string, unknown>) as Promise<TimeEntry>,
    onSuccess: () => {
      toast.success("Entry added");
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: () => toast.error("Failed to add entry"),
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTimeEntry }) =>
      api.timeEntries.update(id, data as Record<string, unknown>) as Promise<TimeEntry>,
    // Optimistically patch the cached entry so inline edits (duration, description,
    // project, billable) land instantly instead of after the round-trip. Duration
    // is recomputed from start/stop with Math.round to match the server's
    // `* 86400 + 0.5` rounding, so an exact 30m span never flickers as 29m.
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["time-entries"] });
      const prev = queryClient.getQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] });

      // Resolve project name/color from the projects cache when reassigning.
      const projects =
        data.projectId !== undefined
          ? queryClient.getQueryData<{ id: string; name: string; color: string | null }[]>(["projects"])
          : undefined;

      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) =>
        old?.map((e) => {
          if (e.id !== id) return e;
          const merged: TimeEntry = { ...e, ...(data as Partial<TimeEntry>) };
          if (data.projectId !== undefined) {
            const proj = projects?.find((p) => p.id === data.projectId);
            merged.projectName = proj?.name ?? null;
            merged.projectColor = proj?.color ?? null;
          }
          if ((data.start !== undefined || data.stop !== undefined) && merged.start && merged.stop) {
            merged.duration = Math.round(
              (new Date(merged.stop).getTime() - new Date(merged.start).getTime()) / 1000
            );
          }
          return merged;
        }) ?? []
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error("Failed to update entry");
    },
    onSuccess: (updated) => {
      // Keep the live timer (bar + sidebar) in sync when the edit targets the
      // currently running entry — e.g. assigning a project from the entries
      // list. setFromWS merges same-id entries without resetting elapsed.
      const timer = useTimerStore.getState();
      if (updated && timer.runningEntry && updated.id === timer.runningEntry.id) {
        timer.setFromWS(updated);
      }
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.timeEntries.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["time-entries"] });
      const prev = queryClient.getQueriesData<TimeEntry[]>({
        queryKey: ["time-entries"],
      });
      queryClient.setQueriesData<TimeEntry[]>(
        { queryKey: ["time-entries"] },
        (old) => old?.filter((e) => e.id !== id) ?? []
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      ctx?.prev.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error("Failed to delete entry");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useBulkDeleteEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.timeEntries.bulkDelete(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ["time-entries"] });
      const prev = queryClient.getQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] });
      const set = new Set(ids);
      queryClient.setQueriesData<TimeEntry[]>(
        { queryKey: ["time-entries"] },
        (old) => old?.filter((e) => !set.has(e.id)) ?? []
      );
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      ctx?.prev.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error("Failed to delete entries");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useBulkUpdateEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: Record<string, unknown> }) =>
      api.timeEntries.bulkUpdate({ ids, patch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: () => toast.error("Failed to update entries"),
  });
}
