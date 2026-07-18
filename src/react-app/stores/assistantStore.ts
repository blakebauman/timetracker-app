import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AssistantChatMessage } from "@shared/schemas";

// Entries older than this stop mattering: the nudges they refer to are all
// same-day facts, so prune to keep the maps small.
const NUDGE_ID_TTL_MS = 3 * 24 * 60 * 60 * 1000;

interface AssistantStore {
  open: boolean;
  // Nudge id → dismissal timestamp (ms). Persisted so a dismissed nudge stays
  // dismissed across reloads while the server keeps emitting it.
  dismissed: Record<string, number>;
  // Nudge id → first-alerted/viewed timestamp (ms). Persisted so a nudge only
  // ever produces one toast/notification per browser, even across reloads.
  seen: Record<string, number>;
  // Toast + browser-notification alerts for new nudges (Settings toggle).
  alertsEnabled: boolean;
  // Session-only conversation with Aski — deliberately not persisted.
  messages: AssistantChatMessage[];

  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
  dismissNudge: (id: string) => void;
  markSeen: (ids: string[]) => void;
  setAlertsEnabled: (v: boolean) => void;
  addMessage: (m: AssistantChatMessage) => void;
  clearMessages: () => void;
}

function pruneOld(map: Record<string, number>): Record<string, number> {
  const cutoff = Date.now() - NUDGE_ID_TTL_MS;
  return Object.fromEntries(Object.entries(map).filter(([, ts]) => ts > cutoff));
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      open: false,
      dismissed: {},
      seen: {},
      alertsEnabled: true,
      messages: [],

      setOpen: (v) => set({ open: v }),
      toggleOpen: () => set((s) => ({ open: !s.open })),
      dismissNudge: (id) =>
        set((s) => ({ dismissed: { ...pruneOld(s.dismissed), [id]: Date.now() } })),
      markSeen: (ids) =>
        set((s) => {
          const seen = pruneOld(s.seen);
          const now = Date.now();
          for (const id of ids) seen[id] = seen[id] ?? now;
          return { seen };
        }),
      setAlertsEnabled: (v) => set({ alertsEnabled: v }),
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: "time-tracker-assistant",
      partialize: (s) => ({
        dismissed: s.dismissed,
        seen: s.seen,
        alertsEnabled: s.alertsEnabled,
      }),
    }
  )
);
