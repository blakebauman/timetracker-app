import { create } from "zustand";
import { persist } from "zustand/middleware";

type RoundMode = "off" | "nearest" | "up" | "down";

// The four interchangeable views hosted by the unified Timer tab.
export type TimerView = "calendar" | "split" | "list" | "timesheet";

interface UIStore {
  sidebarCollapsed: boolean;
  theme: "light" | "dark" | "system";
  timeFormat: "24h" | "12h";
  currency: string;
  roundMode: RoundMode;
  roundMinutes: number;
  timerView: TimerView;
  calendarView: string;
  calendarSlotHeight: number;
  commandOpen: boolean;
  shortcutsOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setTimeFormat: (v: "24h" | "12h") => void;
  setCurrency: (v: string) => void;
  setRounding: (mode: RoundMode, minutes: number) => void;
  setTimerView: (v: TimerView) => void;
  setCalendarView: (v: string) => void;
  setCalendarSlotHeight: (v: number) => void;
  setCommandOpen: (v: boolean) => void;
  openCommand: () => void;
  setShortcutsOpen: (v: boolean) => void;
  openShortcuts: () => void;
}

// Zoom bounds for the calendar time-grid slot height (px), stepped by the
// toolbar +/- controls.
export const CALENDAR_SLOT_HEIGHT_MIN = 20;
export const CALENDAR_SLOT_HEIGHT_MAX = 68;
export const CALENDAR_SLOT_HEIGHT_STEP = 8;
export const CALENDAR_SLOT_HEIGHT_DEFAULT = 44;

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: "system",
      timeFormat: (localStorage.getItem("pref_timeFormat") as "24h" | "12h") ?? "24h",
      currency: localStorage.getItem("pref_currency") ?? "USD",
      roundMode: (localStorage.getItem("pref_roundMode") as RoundMode) ?? "off",
      roundMinutes: Number(localStorage.getItem("pref_roundMinutes")) || 15,
      timerView: "list",
      calendarView: "timeGridWeek",
      calendarSlotHeight: CALENDAR_SLOT_HEIGHT_DEFAULT,
      commandOpen: false,
      shortcutsOpen: false,

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
      setTimerView: (v) => set({ timerView: v }),
      setCalendarView: (v) => set({ calendarView: v }),
      setCalendarSlotHeight: (v) =>
        set({
          calendarSlotHeight: Math.max(
            CALENDAR_SLOT_HEIGHT_MIN,
            Math.min(CALENDAR_SLOT_HEIGHT_MAX, v)
          ),
        }),
      setCommandOpen: (v) => set({ commandOpen: v }),
      openCommand: () => set({ commandOpen: true }),
      setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
      openShortcuts: () => set({ shortcutsOpen: true }),
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
        timerView: s.timerView,
        calendarView: s.calendarView,
        calendarSlotHeight: s.calendarSlotHeight,
      }),
    }
  )
);
