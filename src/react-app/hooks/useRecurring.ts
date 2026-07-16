import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  RecurringEntry,
  CreateRecurringEntry,
  UpdateRecurringEntry,
} from "@shared/schemas";

export function useRecurringEntries() {
  return useQuery({
    queryKey: ["recurring"],
    queryFn: () => api.recurring.list() as Promise<RecurringEntry[]>,
    staleTime: 60_000,
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
    onError: () => toast.error("Failed to save recurring entry"),
  });
}

export function useUpdateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRecurringEntry }) =>
      api.recurring.update(id, data as Record<string, unknown>) as Promise<RecurringEntry>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring"] }),
    onError: () => toast.error("Failed to update recurring entry"),
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
    onError: () => toast.error("Failed to remove recurring entry"),
  });
}
