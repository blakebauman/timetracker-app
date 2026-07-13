import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AiQuickEntryRequest, AiQuickEntryResult, AiSummaryRequest, AiSummaryResult } from "@shared/schemas";

export function useAiQuickEntry() {
  return useMutation({
    mutationFn: (body: AiQuickEntryRequest) =>
      api.ai.quickEntry(body as unknown as Record<string, unknown>) as Promise<AiQuickEntryResult>,
    onError: () => toast.error("Couldn't parse that — try rephrasing or enter it manually."),
  });
}

export function useAiSummary() {
  return useMutation({
    mutationFn: (body: AiSummaryRequest) =>
      api.ai.summary(body as unknown as Record<string, unknown>) as Promise<AiSummaryResult>,
    onError: () => toast.error("Couldn't generate a summary right now."),
  });
}
