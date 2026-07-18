import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AssistantChatMessage } from "@shared/schemas";

// Dismissals older than this stop mattering: the nudges they suppressed are
// long gone (they're all same-day facts), so prune to keep the map small.
const DISMISSAL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

interface AssistantStore {
  open: boolean;
  // Nudge id → dismissal timestamp (ms). Persisted so a dismissed nudge stays
  // dismissed across reloads while the server keeps emitting it.
  dismissed: Record<string, number>;
  // Session-only conversation with Aski — deliberately not persisted.
  messages: AssistantChatMessage[];

  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
  dismissNudge: (id: string) => void;
  addMessage: (m: AssistantChatMessage) => void;
  clearMessages: () => void;
}

function pruneDismissed(dismissed: Record<string, number>): Record<string, number> {
  const cutoff = Date.now() - DISMISSAL_TTL_MS;
  return Object.fromEntries(Object.entries(dismissed).filter(([, ts]) => ts > cutoff));
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      open: false,
      dismissed: {},
      messages: [],

      setOpen: (v) => set({ open: v }),
      toggleOpen: () => set((s) => ({ open: !s.open })),
      dismissNudge: (id) =>
        set((s) => ({ dismissed: { ...pruneDismissed(s.dismissed), [id]: Date.now() } })),
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: "time-tracker-assistant",
      partialize: (s) => ({ dismissed: s.dismissed }),
    }
  )
);
