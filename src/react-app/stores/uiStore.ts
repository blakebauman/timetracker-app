import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIStore {
  sidebarCollapsed: boolean;
  theme: "light" | "dark" | "system";

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: "system",

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: "time-tracker-ui" }
  )
);
