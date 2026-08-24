import { useEffect, useRef } from "react";
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

  /**
   * Keep the stored UTC offset honest.
   *
   * The digest cron has no request to read a timezone from, so it works off the
   * offset stored on the user row. Left alone, a DST change would send the
   * briefing an hour early or late for months — and nobody re-opens Settings to
   * fix a thing they haven't noticed. Reconciled here instead, where every app
   * open passes through, and only when digests are actually on.
   */
  const reconciled = useRef(false);
  const updateSettings = useUpdateSettings();
  const digestOn = Boolean(query.data?.digestDaily || query.data?.digestWeekly);
  const storedOffset = query.data?.digestTimezoneOffsetMinutes;
  useEffect(() => {
    if (!digestOn || reconciled.current || storedOffset === undefined) return;
    const actual = new Date().getTimezoneOffset();
    if (actual === storedOffset) return;
    reconciled.current = true;
    updateSettings.mutate({ digestTimezoneOffsetMinutes: actual });
  }, [digestOn, storedOffset, updateSettings]);

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

/** Send one digest to the signed-in user's own address, right now. */
export function useSendDigest() {
  return useMutation({
    mutationFn: (kind: "daily" | "weekly") => api.settings.sendDigest(kind),
    onSuccess: () => toast.success("Sent — check your inbox"),
    onError: (error: Error) =>
      toast.error(error.message || "Couldn't send the digest"),
  });
}
