import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import type { Settings, UpdateSettings } from "@shared/schemas";

/**
 * Fetch workspace settings from D1 (the source of truth) and hydrate the UI
 * store, so currency / time format survive a localStorage wipe or a device
 * switch. Call once high in the tree (AppShell).
 */
export function useHydrateSettings() {
  const setCurrency = useUIStore((s) => s.setCurrency);
  const setTimeFormat = useUIStore((s) => s.setTimeFormat);
  const setRounding = useUIStore((s) => s.setRounding);
  const setWeekStart = useUIStore((s) => s.setWeekStart);
  const setShowWeekends = useUIStore((s) => s.setShowWeekends);
  const setAutoAssignColors = useUIStore((s) => s.setAutoAssignColors);

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
    staleTime: 5 * 60_000,
  });

  const {
    currency,
    timeFormat,
    roundMode,
    roundMinutes,
    weekStart,
    showWeekends,
    autoAssignColors,
  } = query.data ?? {};
  useEffect(() => {
    if (currency) setCurrency(currency);
    if (timeFormat) setTimeFormat(timeFormat);
    if (roundMode) setRounding(roundMode, roundMinutes ?? 15);
    if (weekStart !== undefined) setWeekStart(weekStart);
    if (showWeekends !== undefined) setShowWeekends(showWeekends);
    if (autoAssignColors !== undefined) setAutoAssignColors(autoAssignColors);
  }, [
    currency,
    timeFormat,
    roundMode,
    roundMinutes,
    weekStart,
    showWeekends,
    autoAssignColors,
    setCurrency,
    setTimeFormat,
    setRounding,
    setWeekStart,
    setShowWeekends,
    setAutoAssignColors,
  ]);

  return query;
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const setCurrency = useUIStore((s) => s.setCurrency);
  const setTimeFormat = useUIStore((s) => s.setTimeFormat);
  const setRounding = useUIStore((s) => s.setRounding);
  const setWeekStart = useUIStore((s) => s.setWeekStart);
  const setShowWeekends = useUIStore((s) => s.setShowWeekends);
  const setAutoAssignColors = useUIStore((s) => s.setAutoAssignColors);

  return useMutation({
    mutationFn: (body: UpdateSettings) => api.settings.update(body),
    onSuccess: (settings: Settings) => {
      queryClient.setQueryData(["settings"], settings);
      setCurrency(settings.currency);
      setTimeFormat(settings.timeFormat);
      setRounding(settings.roundMode, settings.roundMinutes);
      setWeekStart(settings.weekStart);
      setShowWeekends(settings.showWeekends);
      setAutoAssignColors(settings.autoAssignColors);
    },
    onError: () => toast.error("Failed to save settings"),
  });
}
