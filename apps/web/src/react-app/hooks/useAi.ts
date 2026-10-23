import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  AiQuickEntryRequest,
  AiQuickEntryResult,
  AiSummaryRequest,
  AiSummaryResult,
  StatusUpdateRequest,
} from "@timetracker/core/schemas";

export function useAiQuickEntry() {
  return useMutation({
    mutationFn: (body: AiQuickEntryRequest) =>
      api.ai.quickEntry(body as unknown as Record<string, unknown>) as Promise<AiQuickEntryResult>,
    onError: () => toast.error("Couldn't parse that — try rephrasing or enter it manually."),
  });
}

// A query, not a mutation: the draft follows the dialog's week and style, so
// stepping back a week and forward again reuses the draft instead of racing a
// second call. Never stale — a new draft is the Regenerate button's job.
// No onError toast: the dialog shows the failure inline, beside its Retry.
export function useStatusUpdate(body: StatusUpdateRequest | null) {
  return useQuery({
    queryKey: ["status-update", body],
    queryFn: () => api.ai.statusUpdate(body!),
    enabled: body !== null,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useAiSummary() {
  return useMutation({
    mutationFn: (body: AiSummaryRequest) =>
      api.ai.summary(body as unknown as Record<string, unknown>) as Promise<AiSummaryResult>,
    onError: () => toast.error("Couldn't generate a summary right now."),
  });
}
