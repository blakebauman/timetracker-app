import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatDayHeader } from "@/lib/dateUtils";
import type { TimeEntry, CreateTimeEntry, UpdateTimeEntry } from "@shared/schemas";
import { startOfDay, subDays, endOfDay } from "date-fns";

export function useEntries(days = 30) {
  const since = startOfDay(subDays(new Date(), days - 1)).toISOString();
  const until = endOfDay(new Date()).toISOString();

  return useQuery({
    queryKey: ["time-entries", since, until],
    queryFn: () => api.timeEntries.list({ since, until }) as Promise<TimeEntry[]>,
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
        .sort((a, b) => b.entries[0].start.localeCompare(a.entries[0].start));

      return {
        dateKey,
        label: formatDayHeader(dateKey + "T00:00:00"),
        groups,
        totalSeconds: dayEntries.reduce((sum, e) => sum + (e.duration ?? 0), 0),
      };
    });

  return { days: days_list, entries, ...rest };
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTimeEntry) =>
      api.timeEntries.create(data as unknown as Record<string, unknown>) as Promise<TimeEntry>,
    onSuccess: () => {
      toast.success("Entry added");
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: () => toast.error("Failed to add entry"),
  });
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
    onSuccess: () => {
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
