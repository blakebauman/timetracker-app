import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAssistantStore } from "@/stores/assistantStore";
import type {
  AssistantChatRequest,
  AssistantChatResult,
  AssistantNudge,
  AssistantTrackEventRequest,
  AssistantTrackEventResult,
} from "@shared/schemas";

/**
 * Aski's proactive nudges, minus the ones the user dismissed. Polled on a slow
 * interval — each fetch reads through to Google Calendar server-side, so keep
 * it gentle.
 */
export function useAssistantNudges() {
  const dismissed = useAssistantStore((s) => s.dismissed);
  const query = useQuery({
    queryKey: ["assistant-nudges"],
    queryFn: () =>
      api.assistant.nudges(new Date().getTimezoneOffset()) as Promise<AssistantNudge[]>,
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const nudges = (query.data ?? []).filter((n) => !(n.id in dismissed));
  return { ...query, nudges };
}

export function useAssistantChat() {
  return useMutation({
    mutationFn: (body: AssistantChatRequest) =>
      api.assistant.chat(body as unknown as Record<string, unknown>) as Promise<AssistantChatResult>,
    onError: () => toast.error("Aski is unavailable right now — try again shortly."),
  });
}

/**
 * "Add to timesheet" on an untracked-meeting nudge. Server-side create with
 * grounded AI project inference; the toast names the matched project so a
 * wrong guess is noticed immediately.
 */
export function useTrackNudgeEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AssistantTrackEventRequest) =>
      api.assistant.trackEvent(
        body as unknown as Record<string, unknown>
      ) as Promise<AssistantTrackEventResult>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["assistant-nudges"] });
      toast.success(
        data.projectName ? `Added to timesheet · ${data.projectName}` : "Added to timesheet"
      );
    },
    onError: () => toast.error("Couldn't add that meeting — try again."),
  });
}

