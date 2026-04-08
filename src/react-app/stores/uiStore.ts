import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIStore {
  sidebarCollapsed: boolean;
  theme: "light" | "dark" | "system";
  timeFormat: "24h" | "12h";

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setTimeFormat: (v: "24h" | "12h") => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: "system",
      timeFormat: (localStorage.getItem("pref_timeFormat") as "24h" | "12h") ?? "24h",

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setTheme: (theme) => set({ theme }),
      setTimeFormat: (v) => {
        set({ timeFormat: v });
        localStorage.setItem("pref_timeFormat", v);
      },
    }),
    { name: "time-tracker-ui" }
  )
);
