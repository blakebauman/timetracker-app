import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type CalendarProviderId } from "@/lib/api";
export type { ExternalEvent } from "@/lib/calendarMapping";

/** Per-provider calendar connection status for the Settings card. */
export function useCalendarStatus() {
  return useQuery({
    queryKey: ["calendar", "status"],
    queryFn: () => api.calendar.status(),
    staleTime: 30_000,
  });
}

/** External calendar events for the visible range (ghost blocks). */
export function useCalendarEvents(sinceIso: string, untilIso: string, enabled = true) {
  return useQuery({
    queryKey: ["calendar-events", sinceIso, untilIso],
    queryFn: () => api.calendar.events({ since: sinceIso, until: untilIso }),
    enabled,
    // Calendar data changes slowly; avoid hammering the providers on every re-render.
    staleTime: 60_000,
  });
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: CalendarProviderId) => api.calendar.disconnect(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar", "status"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

/** Toggle automatic conversion of finished calendar events into entries. */
export function useSetAutoTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, enabled }: { provider: CalendarProviderId; enabled: boolean }) =>
      api.calendar.setAutoTrack(provider, enabled),
    onSuccess: (_data, { enabled }) => {
      queryClient.invalidateQueries({ queryKey: ["calendar", "status"] });
      toast.success(enabled ? "Auto-tracking calendar events" : "Auto-track turned off");
    },
    onError: () => toast.error("Failed to update auto-track"),
  });
}

/** Convert every unconfirmed calendar event in a range into a tracked entry. */
export function useConvertCalendarRange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { since: string; until: string }) => api.calendar.convert(params),
    onSuccess: ({ created }) => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success(
        created > 0
          ? `Added ${created} ${created === 1 ? "entry" : "entries"} from your calendar`
          : "No new calendar events to add"
      );
    },
    onError: () => toast.error("Couldn't convert calendar events"),
  });
}
