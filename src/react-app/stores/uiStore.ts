import { create } from "zustand";
import { persist } from "zustand/middleware";

type RoundMode = "off" | "nearest" | "up" | "down";

interface UIStore {
  sidebarCollapsed: boolean;
  theme: "light" | "dark" | "system";
  timeFormat: "24h" | "12h";
  currency: string;
  roundMode: RoundMode;
  roundMinutes: number;
  commandOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setTimeFormat: (v: "24h" | "12h") => void;
  setCurrency: (v: string) => void;
  setRounding: (mode: RoundMode, minutes: number) => void;
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
      roundMode: (localStorage.getItem("pref_roundMode") as RoundMode) ?? "off",
      roundMinutes: Number(localStorage.getItem("pref_roundMinutes")) || 15,
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
      setRounding: (mode, minutes) => {
        set({ roundMode: mode, roundMinutes: minutes });
        localStorage.setItem("pref_roundMode", mode);
        localStorage.setItem("pref_roundMinutes", String(minutes));
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
        roundMode: s.roundMode,
        roundMinutes: s.roundMinutes,
      }),
    }
  )
);
