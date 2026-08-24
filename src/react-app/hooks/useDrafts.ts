import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { DraftEntry } from "@shared/schemas";

/**
 * Drafted entries for one local day.
 *
 * Deliberately keyed by the local date string rather than a UTC range: a draft
 * belongs to the day the person lived, and the server stores it that way.
 */
export function useDrafts(localDate: string, enabled = true) {
  return useQuery({
    queryKey: ["drafts", localDate],
    queryFn: () => api.drafts.list(localDate),
    enabled,
    // Drafts only change when this user acts on them or asks for more.
    staleTime: 60_000,
  });
}

/**
 * Drafts across a visible calendar range, as local date strings. Separate query
 * key from the day view so review and the grid don't fight over one cache slot.
 */
export function useDraftRange(since: string, until: string, enabled = true) {
  return useQuery({
    queryKey: ["drafts", "range", since, until],
    queryFn: () => api.drafts.listRange(since, until),
    enabled,
    staleTime: 60_000,
  });
}

function invalidateDay(
  queryClient: ReturnType<typeof useQueryClient>,
  localDate: string
) {
  // Broad on purpose: the day query AND every range query that contains it.
  queryClient.invalidateQueries({ queryKey: ["drafts"] });
  queryClient.invalidateQueries({ queryKey: ["drafts", localDate] });
}

export function useGenerateDrafts(localDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.drafts.generate({
        date: localDate,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData<DraftEntry[]>(["drafts", localDate], result.drafts);
      if (result.drafts.length === 0) {
        toast.success("Nothing left to draft — the day looks covered");
      } else {
        toast.success(
          `${result.drafts.length} ${result.drafts.length === 1 ? "entry" : "entries"} drafted for review`
        );
      }
    },
    onError: () => toast.error("Couldn't draft the day"),
  });
}

export function useUpdateDraft(localDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.drafts.update(id, data),
    onSuccess: () => invalidateDay(queryClient, localDate),
    onError: () => toast.error("Couldn't update the draft"),
  });
}

export function useDiscardDraft(localDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.drafts.discard(id),
    // Optimistic: discarding is the fast half of review, and waiting a round
    // trip per card makes stepping through a day feel like work.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["drafts", localDate] });
      const previous = queryClient.getQueryData<DraftEntry[]>(["drafts", localDate]);
      queryClient.setQueryData<DraftEntry[]>(
        ["drafts", localDate],
        (old) => old?.filter((d) => d.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["drafts", localDate], context.previous);
      }
      toast.error("Couldn't discard the draft");
    },
    onSettled: () => invalidateDay(queryClient, localDate),
  });
}

export function useDiscardDay(localDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.drafts.discardDay(localDate),
    onSuccess: ({ deleted }) => {
      invalidateDay(queryClient, localDate);
      if (deleted > 0) toast.success(`Discarded ${deleted} drafts`);
    },
    onError: () => toast.error("Couldn't discard the drafts"),
  });
}

/**
 * Confirm drafts into real time entries.
 *
 * `reportedTotalSeconds` scales the batch proportionally to the total the user
 * actually stands behind — the last step of review, where the day's number is
 * corrected once rather than entry by entry.
 */
export function useConfirmDrafts(localDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[]; reportedTotalSeconds?: number | null }) =>
      api.drafts.confirm(body),
    onSuccess: ({ confirmed }) => {
      invalidateDay(queryClient, localDate);
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(
        `${confirmed} ${confirmed === 1 ? "entry" : "entries"} added to your timesheet`
      );
    },
    onError: () => toast.error("Couldn't confirm the drafts"),
  });
}
