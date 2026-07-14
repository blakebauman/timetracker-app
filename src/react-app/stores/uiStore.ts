import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIStore {
  sidebarCollapsed: boolean;
  theme: "light" | "dark" | "system";
  timeFormat: "24h" | "12h";
  currency: string;
  commandOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setTimeFormat: (v: "24h" | "12h") => void;
  setCurrency: (v: string) => void;
  setCommandOpen: (v: boolean) => void;
  openCommand: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: "system",
      timeFormat: (localStorage.getItem("pref_timeFormat") as "24h" | "12h") ?? "24h",
      currency: localStorage.getItem("pref_currency") ?? "USD",
      commandOpen: false,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setTheme: (theme) => set({ theme }),
      setTimeFormat: (v) => {
        set({ timeFormat: v });
        localStorage.setItem("pref_timeFormat", v);
      },
      setCurrency: (v) => {
        set({ currency: v });
        localStorage.setItem("pref_currency", v);
      },
      setCommandOpen: (v) => set({ commandOpen: v }),
      openCommand: () => set({ commandOpen: true }),
    }),
    {
      name: "time-tracker-ui",
      // Only persist real preferences — not transient UI like the palette.
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
        timeFormat: s.timeFormat,
        currency: s.currency,
      }),
    }
  )
);
