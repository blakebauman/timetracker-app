import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, mutationErrorMessage } from "@/lib/api";
import type { WeekReview } from "@timetracker/core/schemas";

const key = (weekStart: string | null) => ["week-review", weekStart] as const;

/**
 * One week's review. Short-lived: it's a reading of the entries, and an edit
 * from anywhere — another device, auto-track, the Assistant, MCP — changes it.
 * Entry mutations invalidate it, but the dialog (`fresh`) doesn't rely on
 * that: it refetches whenever it opens or steps to a week, because "nothing
 * has changed since you closed it" is the one sentence it must not get wrong.
 */
export function useWeekReview(weekStart: string | null, { fresh = false } = {}) {
  return useQuery({
    queryKey: key(weekStart),
    queryFn: () => api.weekReview.get(weekStart!, new Date().getTimezoneOffset()),
    enabled: weekStart !== null,
    staleTime: fresh ? 0 : 30_000,
  });
}

export function useCloseWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (weekStart: string) => api.weekReview.close(weekStart, new Date().getTimezoneOffset()),
    onSuccess: (review: WeekReview) => {
      queryClient.setQueryData(key(review.weekStart), review);
      // The week nudge is about exactly this.
      void queryClient.invalidateQueries({ queryKey: ["assistant-nudges"] });
    },
    onError: (err) => toast.error(mutationErrorMessage(err, "Couldn't close the week")),
  });
}

export function useReopenWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (weekStart: string) => api.weekReview.reopen(weekStart),
    onSuccess: (_res, weekStart) => {
      void queryClient.invalidateQueries({ queryKey: key(weekStart) });
      void queryClient.invalidateQueries({ queryKey: ["assistant-nudges"] });
    },
    onError: (err) => toast.error(mutationErrorMessage(err, "Couldn't reopen the week")),
  });
}
