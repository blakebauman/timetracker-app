import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, isQueuedOffline, mutationErrorMessage } from "@/lib/api";
import type {
  RecurringEntry,
  CreateRecurringEntry,
  UpdateRecurringEntry,
} from "@timetracker/core/schemas";

export function useRecurringEntries() {
  return useQuery({
    queryKey: ["recurring"],
    queryFn: () => api.recurring.list() as Promise<RecurringEntry[]>,
    staleTime: 5 * 60_000,
  });
}

export function useCreateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRecurringEntry) =>
      api.recurring.create(data as Record<string, unknown>) as Promise<RecurringEntry>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Recurring entry saved");
    },
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info("Offline — the recurring entry will be saved when you reconnect")
        : toast.error(mutationErrorMessage(err, "Failed to save recurring entry")),
  });
}

export function useUpdateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRecurringEntry }) =>
      api.recurring.update(id, data as Record<string, unknown>) as Promise<RecurringEntry>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring"] }),
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info("Offline — the recurring entry will be updated when you reconnect")
        : toast.error(mutationErrorMessage(err, "Failed to update recurring entry")),
  });
}

export function useDeleteRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.recurring.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Recurring entry removed");
    },
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info("Offline — the recurring entry will be removed when you reconnect")
        : toast.error(mutationErrorMessage(err, "Failed to remove recurring entry")),
  });
}
