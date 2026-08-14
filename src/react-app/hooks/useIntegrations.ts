import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  CreateIntegration,
  Integration,
  UpdateIntegration,
} from "@shared/schemas";

export function useIntegrations() {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.integrations.list() as Promise<Integration[]>,
    staleTime: 5 * 60_000,
  });
}

export function useCreateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateIntegration) =>
      api.integrations.create(data as unknown as Record<string, unknown>) as Promise<Integration>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integration added");
    },
    onError: () => toast.error("Failed to add integration"),
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateIntegration }) =>
      api.integrations.update(id, data as unknown as Record<string, unknown>) as Promise<Integration>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integration updated");
    },
    onError: () => toast.error("Failed to update integration"),
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.integrations.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Integration removed");
    },
    onError: () => toast.error("Failed to remove integration"),
  });
}

export function useTestIntegration() {
  return useMutation({
    mutationFn: (id: string) => api.integrations.test(id),
  });
}

export function usePushEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    // The browser is the only party that knows which zone the tracked day was
    // lived in — the server holds UTC instants, and the external systems file
    // against a calendar date. Sent as an IANA id so the server can resolve it
    // per entry, DST included.
    mutationFn: (vars: { entryIds: string[]; comment?: string }) =>
      api.integrations.push({
        ...vars,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    onSuccess: (data) => {
      const results = data?.results ?? [];
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      const firstError = results.find((r) => !r.ok)?.error;
      if (failed === 0) {
        toast.success(`${ok} ${ok === 1 ? "entry" : "entries"} pushed`);
      } else if (ok === 0) {
        toast.error(
          failed === 1 ? (firstError ?? "Push failed") : `${failed} entries failed to push`,
          failed > 1 ? { description: firstError } : undefined
        );
      } else {
        toast.warning(`${ok} pushed, ${failed} failed`, { description: firstError });
      }
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: () => toast.error("Failed to push entries"),
  });
}
