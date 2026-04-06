import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatDayHeader } from "@/lib/dateUtils";
import type { TimeEntry, UpdateTimeEntry } from "@shared/schemas";
import { startOfDay, subDays, endOfDay } from "date-fns";

export function useEntries(days = 30) {
  const since = startOfDay(subDays(new Date(), days - 1)).toISOString();
  const until = endOfDay(new Date()).toISOString();

  return useQuery({
    queryKey: ["time-entries", since, until],
    queryFn: () => api.timeEntries.list({ since, until }) as Promise<TimeEntry[]>,
  });
}

export function useGroupedEntries(days = 30) {
  const { data: entries = [], ...rest } = useEntries(days);

  const grouped = entries.reduce(
    (acc, entry) => {
      const dayKey = entry.start.slice(0, 10);
      if (!acc[dayKey]) acc[dayKey] = [];
      acc[dayKey].push(entry);
      return acc;
    },
    {} as Record<string, TimeEntry[]>
  );

  const days_list = Object.keys(grouped)
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => ({
      dateKey,
      label: formatDayHeader(dateKey + "T00:00:00"),
      entries: grouped[dateKey].sort((a, b) => b.start.localeCompare(a.start)),
      totalSeconds: grouped[dateKey].reduce(
        (sum, e) => sum + (e.duration ?? 0),
        0
      ),
    }));

  return { days: days_list, entries, ...rest };
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTimeEntry }) =>
      api.timeEntries.update(id, data as Record<string, unknown>) as Promise<TimeEntry>,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["time-entries"] }),
    onError: () => toast.error("Failed to update entry"),
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
      toast.success("Entry deleted");
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
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
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} ${ids.length === 1 ? "entry" : "entries"} deleted`);
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
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
    },
    onError: () => toast.error("Failed to update entries"),
  });
}
