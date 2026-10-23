import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, isQueuedOffline, mutationErrorMessage } from "@/lib/api";
import { useDayRollover } from "@/hooks/useDayRollover";
import { dateToLocalDate, localDateToDate } from "@/lib/taskUtils";
import type { CreateDaysOff, DayOff, DayOffPortion } from "@timetracker/core/schemas";

/** How far back the list reaches: far enough to undo a booking made by mistake last month. */
const LOOKBACK_DAYS = 31;

/**
 * The user's days off from a month ago onward, as one small query every reader
 * shares — a person books a handful of days a year, so a client-side filter
 * beats a query per range.
 */
export function useDaysOff() {
  const today = useDayRollover();
  const from = useMemo(() => {
    const d = localDateToDate(today);
    d.setDate(d.getDate() - LOOKBACK_DAYS);
    return dateToLocalDate(d);
  }, [today]);
  return useQuery({
    queryKey: ["days-off", from],
    queryFn: () => api.daysOff.list(from),
    staleTime: 5 * 60_000,
  });
}

/** Local date → which part of it is off. */
export function useDaysOffMap(): ReadonlyMap<string, DayOffPortion> {
  const { data } = useDaysOff();
  return useMemo(() => new Map((data ?? []).map((d) => [d.date, d.portion])), [data]);
}

/** Which part of today is off, if any. */
export function useTodayOff(): DayOffPortion | undefined {
  const today = useDayRollover();
  return useDaysOffMap().get(today);
}

/**
 * Everything that reads a day off — pacing, nudges, the plan — is computed
 * from it, so a change invalidates those too rather than waiting out their
 * stale times.
 */
function invalidateDerived(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["days-off"] });
  void queryClient.invalidateQueries({ queryKey: ["projects", "pacing"] });
  void queryClient.invalidateQueries({ queryKey: ["assistant-nudges"] });
}

export function useCreateDaysOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDaysOff) => api.daysOff.create(body),
    onSuccess: (rows: DayOff[]) => {
      invalidateDerived(queryClient);
      toast.success(rows.length === 1 ? "Day off added" : `${rows.length} days off added`);
    },
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info("Offline — the day off will be added when you reconnect")
        : toast.error(mutationErrorMessage(err, "Couldn't add the day off")),
  });
}

/** Removes a run of days at once — a fortnight's leave is one thing to the person who booked it. */
export function useDeleteDaysOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.daysOff.delete(id))),
    onSuccess: () => invalidateDerived(queryClient),
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info("Offline — the day off will be removed when you reconnect")
        : toast.error(mutationErrorMessage(err, "Couldn't remove the day off")),
  });
}
