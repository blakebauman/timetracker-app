import { useMemo, useState, Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  startOfMonth,
  endOfMonth,
  addMonths,
} from "date-fns";
import { EntryList } from "@/components/entries/EntryList";
import { TimerWorkspaceHeader } from "@/components/timer/TimerWorkspaceHeader";
import { AddEntryDialog } from "@/components/entries/AddEntryDialog";
import { AiQuickAddDialog } from "@/components/entries/AiQuickAddDialog";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import { useEntriesRange } from "@/hooks/useEntries";
import {
  useUIStore,
  CALENDAR_SLOT_HEIGHT_STEP,
} from "@/stores/uiStore";
import type { CalendarViewType } from "@/components/calendar/CalendarView";
import type { LoggedSegment } from "@/components/timer/TimerWorkspaceHeader";

// FullCalendar (~270 kB) and the timesheet grid load only when their view is
// selected, keeping the eager Timer landing route lean.
const CalendarBody = lazy(() =>
  import("@/components/calendar/CalendarBody").then((m) => ({ default: m.CalendarBody }))
);
const TimesheetView = lazy(() =>
  import("@/components/timesheet/TimesheetView").then((m) => ({ default: m.TimesheetView }))
);

function BodyFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

// The unified Timer tab: owns the navigable week + active view, renders the
// shared header, and swaps the body between list / calendar / split / timesheet.
export function TimerWorkspace() {
  const view = useUIStore((s) => s.timerView);
  const setView = useUIStore((s) => s.setTimerView);
  const calendarView = useUIStore((s) => s.calendarView) as CalendarViewType;
  const setCalendarView = useUIStore((s) => s.setCalendarView);
  const slotHeight = useUIStore((s) => s.calendarSlotHeight);
  const setSlotHeight = useUIStore((s) => s.setCalendarSlotHeight);
  const weekStart = useUIStore((s) => s.weekStart);
  const showWeekends = useUIStore((s) => s.showWeekends);
  const setShowWeekends = useUIStore((s) => s.setShowWeekends);
  const showGaps = useUIStore((s) => s.showGaps);
  const setShowGaps = useUIStore((s) => s.setShowGaps);
  const wso = weekStart as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  // The month view navigates and scopes by calendar month; every other view by week.
  const isMonthView =
    (view === "calendar" || view === "split") && calendarView === "dayGridMonth";

  const [anchor, setAnchor] = useState(() => new Date());
  const since = useMemo(
    () => (isMonthView ? startOfMonth(anchor) : startOfWeek(anchor, { weekStartsOn: wso })),
    [anchor, isMonthView, wso]
  );
  const until = useMemo(
    () => (isMonthView ? endOfMonth(anchor) : endOfWeek(anchor, { weekStartsOn: wso })),
    [anchor, isMonthView, wso]
  );

  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [aiQuickAddOpen, setAiQuickAddOpen] = useState(false);

  // Week entries drive the "Logged" bar. Shares the ["time-entries", since, until]
  // query key with the body views, so this is deduped, not a second fetch.
  const { data: entries = [] } = useEntriesRange(since.toISOString(), until.toISOString());
  const { periodSeconds, segments } = useMemo(() => {
    const byProject = new Map<string | null, LoggedSegment>();
    let total = 0;
    for (const e of entries) {
      const secs = e.duration ?? 0;
      if (secs <= 0) continue;
      total += secs;
      const seg = byProject.get(e.projectId);
      if (seg) seg.seconds += secs;
      else
        byProject.set(e.projectId, {
          projectId: e.projectId,
          projectName: e.projectName,
          color: e.projectColor ?? DEFAULT_PROJECT_COLOR,
          seconds: secs,
        });
    }
    return {
      periodSeconds: total,
      segments: [...byProject.values()].sort((a, b) => b.seconds - a.seconds),
    };
  }, [entries]);

  const calendar = (
    <CalendarBody
      periodStart={since}
      calendarView={calendarView}
      slotHeight={slotHeight}
      weekStartsOn={weekStart}
      showWeekends={showWeekends}
      showGaps={showGaps}
    />
  );
  const list = <EntryList since={since} until={until} />;

  let body: React.ReactNode;
  if (view === "calendar") body = <Suspense fallback={<BodyFallback />}>{calendar}</Suspense>;
  else if (view === "timesheet")
    body = (
      <Suspense fallback={<BodyFallback />}>
        <TimesheetView weekStart={since} />
      </Suspense>
    );
  else if (view === "split")
    body = (
      <Suspense fallback={<BodyFallback />}>
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-x lg:grid-cols-2">
          <div className="flex min-h-0 flex-col">{calendar}</div>
          <div className="flex min-h-0 flex-col overflow-hidden">{list}</div>
        </div>
      </Suspense>
    );
  else body = list;

  return (
    <div className="flex h-full flex-col">
      <TimerWorkspaceHeader
        since={since}
        until={until}
        totalSeconds={periodSeconds}
        segments={segments}
        view={view}
        onViewChange={setView}
        onPrev={() => setAnchor((d) => (isMonthView ? addMonths(d, -1) : addWeeks(d, -1)))}
        onNext={() => setAnchor((d) => (isMonthView ? addMonths(d, 1) : addWeeks(d, 1)))}
        onToday={() => setAnchor(new Date())}
        onAddEntry={() => setAddEntryOpen(true)}
        onAiQuickAdd={() => setAiQuickAddOpen(true)}
        calendarView={calendarView}
        onCalendarViewChange={setCalendarView}
        slotHeight={slotHeight}
        onZoomIn={() => setSlotHeight(slotHeight + CALENDAR_SLOT_HEIGHT_STEP)}
        onZoomOut={() => setSlotHeight(slotHeight - CALENDAR_SLOT_HEIGHT_STEP)}
        showWeekends={showWeekends}
        onToggleWeekends={() => setShowWeekends(!showWeekends)}
        showGaps={showGaps}
        onToggleGaps={() => setShowGaps(!showGaps)}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>

      <AddEntryDialog open={addEntryOpen} onClose={() => setAddEntryOpen(false)} />
      <AiQuickAddDialog open={aiQuickAddOpen} onClose={() => setAiQuickAddOpen(false)} />
    </div>
  );
}
