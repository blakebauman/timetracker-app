import type { TimerView } from "@/stores/uiStore";

// Ids shared by the tablist (TimerViewSwitcher) and the panel it controls
// (TimerWorkspace). They live outside both components so neither file has to
// export a non-component alongside its component.

export const TIMER_PANEL_ID = "timer-workspace-panel";

export const timerTabId = (view: TimerView) => `timer-tab-${view}`;
