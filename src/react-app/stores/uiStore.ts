import { create } from "zustand";
import { persist } from "zustand/middleware";

type RoundMode = "off" | "nearest" | "up" | "down";

// The four interchangeable views hosted by the unified Timer tab.
export type TimerView = "calendar" | "split" | "list" | "timesheet";

// Device-local productivity preferences (idle detection, tracking reminders,
// pomodoro). Kept client-side since they're per-device behaviors.
export interface ProductivitySettings {
  idleEnabled: boolean;
  idleThresholdMinutes: number;
  reminderEnabled: boolean;
  reminderIntervalMinutes: number;
  pomodoroEnabled: boolean;
  pomodoroWorkMinutes: number;
  pomodoroBreakMinutes: number;
}

const DEFAULT_PRODUCTIVITY: ProductivitySettings = {
  idleEnabled: false,
  idleThresholdMinutes: 10,
  reminderEnabled: false,
  reminderIntervalMinutes: 30,
  pomodoroEnabled: false,
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
};

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
  // Calendar prefs, hydrated from D1 settings but persisted locally for instant paint.
  weekStart: number; // 0=Sun … 6=Sat
  showWeekends: boolean;
  showGaps: boolean;
  autoAssignColors: boolean;
  productivity: ProductivitySettings;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  discardConfirmOpen: boolean;
  // Transient: the entry row to flash-highlight (e.g. the one just stopped so the
  // eye can track where it landed in the list). Never persisted.
  highlightedEntryId: string | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setTimeFormat: (v: "24h" | "12h") => void;
  setCurrency: (v: string) => void;
  setRounding: (mode: RoundMode, minutes: number) => void;
  setTimerView: (v: TimerView) => void;
  setCalendarView: (v: string) => void;
  setCalendarSlotHeight: (v: number) => void;
  setWeekStart: (v: number) => void;
  setShowWeekends: (v: boolean) => void;
  setShowGaps: (v: boolean) => void;
  setAutoAssignColors: (v: boolean) => void;
  setProductivity: (p: Partial<ProductivitySettings>) => void;
  setCommandOpen: (v: boolean) => void;
  openCommand: () => void;
  setShortcutsOpen: (v: boolean) => void;
  openShortcuts: () => void;
  setDiscardConfirmOpen: (v: boolean) => void;
  flashEntry: (id: string) => void;
}

// Holds the auto-clear timer for the row highlight so a rapid second stop resets
// the countdown instead of clearing the first one's flash mid-animation.
let flashTimeout: ReturnType<typeof setTimeout> | undefined;

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
      weekStart: Number(localStorage.getItem("pref_weekStart") ?? 1),
      showWeekends: localStorage.getItem("pref_showWeekends") !== "false",
      showGaps: localStorage.getItem("pref_showGaps") !== "false",
      autoAssignColors: localStorage.getItem("pref_autoAssignColors") === "true",
      productivity: DEFAULT_PRODUCTIVITY,
      commandOpen: false,
      shortcutsOpen: false,
      discardConfirmOpen: false,
      highlightedEntryId: null,

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
      setWeekStart: (v) => {
        set({ weekStart: v });
        localStorage.setItem("pref_weekStart", String(v));
      },
      setShowWeekends: (v) => {
        set({ showWeekends: v });
        localStorage.setItem("pref_showWeekends", String(v));
      },
      setShowGaps: (v) => {
        set({ showGaps: v });
        localStorage.setItem("pref_showGaps", String(v));
      },
      setAutoAssignColors: (v) => {
        set({ autoAssignColors: v });
        localStorage.setItem("pref_autoAssignColors", String(v));
      },
      setProductivity: (p) =>
        set((s) => ({ productivity: { ...s.productivity, ...p } })),
      setCommandOpen: (v) => set({ commandOpen: v }),
      openCommand: () => set({ commandOpen: true }),
      setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
      openShortcuts: () => set({ shortcutsOpen: true }),
      setDiscardConfirmOpen: (v) => set({ discardConfirmOpen: v }),
      flashEntry: (id) => {
        clearTimeout(flashTimeout);
        set({ highlightedEntryId: id });
        // Outlast the refetch + the row's highlight keyframe, then release so a
        // later re-render doesn't re-trigger the flash.
        flashTimeout = setTimeout(() => set({ highlightedEntryId: null }), 2500);
      },
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
        weekStart: s.weekStart,
        showWeekends: s.showWeekends,
        showGaps: s.showGaps,
        autoAssignColors: s.autoAssignColors,
        productivity: s.productivity,
      }),
    }
  )
);
