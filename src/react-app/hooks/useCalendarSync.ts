import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
export type { ExternalEvent } from "@/lib/calendarMapping";

/** Google Calendar connection status for the Settings card. */
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
    // Calendar data changes slowly; avoid hammering Google on every re-render.
    staleTime: 60_000,
  });
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.calendar.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar", "status"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}
