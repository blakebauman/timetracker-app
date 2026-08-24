import { useMemo, useState, Suspense, lazy } from "react";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  startOfMonth,
  endOfMonth,
  addMonths,
  startOfDay,
  endOfDay,
  addDays,
  isSameDay,
  format,
  parseISO,
} from "date-fns";
import { EntryList } from "@/components/entries/EntryList";
import { TimerWorkspaceHeader } from "@/components/timer/TimerWorkspaceHeader";
import { TIMER_PANEL_ID, timerTabId } from "@/components/timer/timerTabs";
import { AddEntryDialog } from "@/components/entries/AddEntryDialog";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import { useEntriesRange } from "@/hooks/useEntries";
import { useDraftRange, useGenerateDrafts } from "@/hooks/useDrafts";
import { resolveListRange } from "@/lib/dateUtils";
import {
  useUIStore,
  CALENDAR_SLOT_HEIGHT_STEP,
} from "@/stores/uiStore";
import { useDayRollover } from "@/hooks/useDayRollover";
import { useMediaQuery, BELOW_MD, BELOW_LG } from "@/hooks/useMediaQuery";
import { useElementWidth } from "@/hooks/useElementWidth";
import { resolveCalendarDensity } from "@/lib/calendarDensity";
import type { TimerView } from "@/stores/uiStore";
import type { CalendarViewType } from "@/components/calendar/CalendarView";
import type { LoggedSegment } from "@/components/timer/TimerWorkspaceHeader";
import { Spinner } from "@/components/ui/spinner";

// Review pulls in the project picker and the entry controls; it's only ever
// opened deliberately, so it shouldn't sit in the Timer landing chunk.
const DraftReviewDialog = lazy(() =>
  import("@/components/drafts/DraftReviewDialog").then((m) => ({
    default: m.DraftReviewDialog,
  }))
);

// FullCalendar (~270 kB) and the timesheet grid load only when their view is
// selected, keeping the eager Timer landing route lean.
const CalendarBody = lazy(() =>
  import("@/components/calendar/CalendarBody").then((m) => ({ default: m.CalendarBody }))
);
const TimesheetView = lazy(() =>
  import("@/components/timesheet/TimesheetView").then((m) => ({ default: m.TimesheetView }))
);
const PlannerView = lazy(() =>
  import("@/components/planner/PlannerView").then((m) => ({ default: m.PlannerView }))
);

function BodyFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner size="lg" className="text-muted-foreground" />
    </div>
  );
}

// The unified Timer tab: owns the navigable week + active view, renders the
// shared header, and swaps the body between list / calendar / split / timesheet
// / planner.
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
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const listRangeKey = useUIStore((s) => s.listRangeKey);
  const listRangeSince = useUIStore((s) => s.listRangeSince);
  const listRangeUntil = useUIStore((s) => s.listRangeUntil);
  const setListRange = useUIStore((s) => s.setListRange);
  const wso = weekStart as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  // Split cannot work in one column: below lg it collapsed to a bare row of
  // day-number headers with no grid body, orphaned above the list.
  const belowLg = useMediaQuery(BELOW_LG);
  const belowMd = useMediaQuery(BELOW_MD);

  const effectiveView: TimerView = view === "split" && belowLg ? "list" : view;
  const isCalendarish = effectiveView === "calendar" || effectiveView === "split";

  // Grid density comes from the calendar pane's own width, not the viewport.
  // Split halves the pane while leaving the viewport untouched, so a
  // viewport-based rule left Split at 1280 rendering 50px columns. See
  // resolveCalendarDensity. Until the first measurement lands, fall back to a
  // viewport guess so the first paint isn't chosen from a width of nothing.
  const { ref: calendarPaneRef, width: paneWidth } = useElementWidth<HTMLDivElement>();
  const effectiveCalendarView: CalendarViewType = resolveCalendarDensity(
    calendarView,
    paneWidth,
    belowMd ? 1 : 7
  );

  // The month view navigates and scopes by calendar month; the forced day view
  // by day; everything else by week.
  const isMonthView = isCalendarish && effectiveCalendarView === "dayGridMonth";
  const isDayView = isCalendarish && effectiveCalendarView === "timeGridDay";

  // Every period this component resolves is relative to "now", so both the
  // memo below and the default anchor have to be recomputed when the calendar
  // day rolls over under an open tab — see useDayRollover.
  const dayKey = useDayRollover();

  // `null` means "follow the clock": the grid views open on today and keep
  // following it across midnight. Stepping or revealing a date pins an explicit
  // anchor; the Today button releases it again.
  const [anchorOverride, setAnchorOverride] = useState<Date | null>(null);
  const today = useMemo(() => parseISO(dayKey), [dayKey]);
  const anchor = anchorOverride ?? today;

  // The list view scopes by the user's chosen range (persisted); every other
  // view — including the list pane *inside* split, which must stay aligned with
  // the calendar beside it — scopes by the navigable week/month.
  const isListView = effectiveView === "list";
  const { since, until } = useMemo(() => {
    if (isListView) {
      const r = resolveListRange(listRangeKey, listRangeSince, listRangeUntil, wso, today);
      return { since: r.since, until: r.until };
    }
    if (isMonthView) return { since: startOfMonth(anchor), until: endOfMonth(anchor) };
    if (isDayView) return { since: startOfDay(anchor), until: endOfDay(anchor) };
    return {
      since: startOfWeek(anchor, { weekStartsOn: wso }),
      until: endOfWeek(anchor, { weekStartsOn: wso }),
    };
  }, [
    anchor,
    today,
    isMonthView,
    isDayView,
    isListView,
    listRangeKey,
    listRangeSince,
    listRangeUntil,
    wso,
  ]);

  const [addEntryOpen, setAddEntryOpen] = useState(false);

  /**
   * Which day drafting and review act on.
   *
   * Today when the visible period contains it, otherwise the first day of the
   * period. Drafting tomorrow is meaningless (nothing has happened yet), and
   * silently drafting a day the user isn't looking at would be worse.
   */
  const reviewDate = format(
    today >= since && today <= until ? today : since,
    "yyyy-MM-dd"
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDay, setReviewDay] = useState<string>(reviewDate);
  const generateDrafts = useGenerateDrafts(reviewDate);
  const { data: periodDrafts = [] } = useDraftRange(
    format(since, "yyyy-MM-dd"),
    format(until, "yyyy-MM-dd")
  );

  const openReview = (day: string) => {
    setReviewDay(day);
    setReviewOpen(true);
  };

  // Drafting and reviewing are one button: propose what's missing, then show
  // the result. When proposals are already waiting, skip straight to them
  // rather than making the user ask for more of what they haven't looked at.
  const handleDraftDay = () => {
    const waiting = periodDrafts.filter((d) => d.localDate === reviewDate);
    if (waiting.length > 0) {
      openReview(reviewDate);
      return;
    }
    generateDrafts.mutate(undefined, {
      onSuccess: (result) => {
        if (result.drafts.length > 0) openReview(reviewDate);
      },
    });
  };

  /**
   * Carry the period across a view switch.
   *
   * The list scopes by an explicit range; the grid views step by week/month/day.
   * Left unlinked, tabbing List → Calendar silently changed both the visible
   * dates and the header total (38h 30m → 6h 30m) with nothing to mark it — the
   * single most corrosive defect for someone about to put that number on an
   * invoice. Now the period follows the user in both directions, so in the common
   * case the two views agree.
   *
   * A grid period is usually narrower than the list range, so leaving the list
   * has to choose *which* part of it to land on. Prefer the one containing today
   * — a list showing this week opens Split on today, not on Monday, and "All
   * dates" opens on this week rather than on the epoch. Only when the range is
   * entirely in the past (or future) does the grid fall back to its first day.
   *
   * The today-preference used to live in CalendarBody as a grid-only override,
   * which is how the desync got in: the grid jumped to today while the header,
   * the "Logged" strip, the totals and the entry pane all stayed on the range
   * start. It belongs here, where moving the anchor moves all four together.
   */
  const changeView = (next: TimerView) => {
    const leavingList = effectiveView === "list" && next !== "list";
    const enteringList = effectiveView !== "list" && next === "list";

    if (leavingList) {
      setAnchorOverride(today >= since && today <= until ? today : since);
    } else if (enteringList && !belowMd) {
      // Name the period if it's one the picker can express, else keep the exact
      // dates as a custom range.
      const wk = resolveListRange("thisWeek", null, null, wso, today);
      const lastWk = resolveListRange("lastWeek", null, null, wso, today);
      if (isSameDay(since, wk.since) && isSameDay(until, wk.until)) {
        setListRange("thisWeek");
      } else if (isSameDay(since, lastWk.since) && isSameDay(until, lastWk.until)) {
        setListRange("lastWeek");
      } else {
        setListRange("custom", format(since, "yyyy-MM-dd"), format(until, "yyyy-MM-dd"));
      }
    }
    // Below md the calendar is forced to a single day by *layout*, not by the
    // user asking for a day. Writing that back into the list range turned every
    // phone view-switch into "Custom range / Logged today", dropping the total
    // from a week to a day — reintroducing on phones exactly the drift this
    // function exists to prevent. The user's own list range is left intact.
    setView(next);
  };

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

  // In split the entry list sits beside the grid and explains an empty period
  // itself, so the grid's own overlay would just say it twice.
  const calendarFor = (view: TimerView) => (
    <CalendarBody
      periodStart={since}
      calendarView={effectiveCalendarView}
      slotHeight={slotHeight}
      weekStartsOn={weekStart}
      showWeekends={showWeekends}
      showGaps={showGaps}
      showEmptyState={view !== "split"}
      onReviewDay={openReview}
    />
  );
  const list = (
    <EntryList since={since} until={until} onAddEntry={() => setAddEntryOpen(true)} />
  );

  let body: React.ReactNode;
  if (effectiveView === "calendar")
    body = (
      <Suspense fallback={<BodyFallback />}>
        <div ref={calendarPaneRef} className="flex min-h-0 flex-1 flex-col">
          {calendarFor("calendar")}
        </div>
      </Suspense>
    );
  else if (effectiveView === "timesheet")
    body = (
      <Suspense fallback={<BodyFallback />}>
        <TimesheetView weekStart={since} />
      </Suspense>
    );
  else if (effectiveView === "planner")
    body = (
      <Suspense fallback={<BodyFallback />}>
        <PlannerView weekStart={since} />
      </Suspense>
    );
  else if (effectiveView === "split")
    // Only reachable at lg and up — below that `effectiveView` is already "list".
    body = (
      <Suspense fallback={<BodyFallback />}>
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-x lg:grid-cols-2">
          <div ref={calendarPaneRef} className="flex min-h-0 flex-col">
            {calendarFor("split")}
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden">{list}</div>
        </div>
      </Suspense>
    );
  else body = list;

  /** Move whichever period control is active so `date` becomes visible. */
  const revealDate = (date: Date) => {
    setAnchorOverride(date);
    if (effectiveView === "list") {
      setListRange("custom", format(date, "yyyy-MM-dd"), format(date, "yyyy-MM-dd"));
    }
  };

  // Stepping pins the anchor: from here on the grid stays where the user put it
  // rather than following the clock (`?? today` only applies while unpinned).
  const step = (dir: 1 | -1) =>
    setAnchorOverride((d) => {
      const from = d ?? anchor;
      return isMonthView
        ? addMonths(from, dir)
        : isDayView
          ? addDays(from, dir)
          : addWeeks(from, dir);
    });

  return (
    <div className="flex h-full flex-col">
      <TimerWorkspaceHeader
        since={since}
        until={until}
        totalSeconds={periodSeconds}
        segments={segments}
        view={effectiveView}
        onViewChange={changeView}
        allowSplit={!belowLg}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        periodNoun={isMonthView ? "month" : isDayView ? "day" : "week"}
        weekStartsOn={wso}
        onToday={() => setAnchorOverride(null)}
        onAddEntry={() => setAddEntryOpen(true)}
        onAiQuickAdd={openQuickAdd}
        onDraftDay={handleDraftDay}
        draftPending={generateDrafts.isPending}
        draftCount={periodDrafts.length}
        calendarView={effectiveCalendarView}
        requestedCalendarView={calendarView}
        onCalendarViewChange={setCalendarView}
        slotHeight={slotHeight}
        onZoomIn={() => setSlotHeight(slotHeight + CALENDAR_SLOT_HEIGHT_STEP)}
        onZoomOut={() => setSlotHeight(slotHeight - CALENDAR_SLOT_HEIGHT_STEP)}
        showWeekends={showWeekends}
        onToggleWeekends={() => setShowWeekends(!showWeekends)}
        showGaps={showGaps}
        onToggleGaps={() => setShowGaps(!showGaps)}
        listRangeKey={listRangeKey}
        listRangeSince={listRangeSince}
        listRangeUntil={listRangeUntil}
        onListRangeChange={setListRange}
      />

      <div
        id={TIMER_PANEL_ID}
        role="tabpanel"
        aria-labelledby={timerTabId(view)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {body}
      </div>

      <AddEntryDialog
        open={addEntryOpen}
        onClose={() => setAddEntryOpen(false)}
        visibleRange={{ since, until }}
        onRevealDate={revealDate}
      />

      {reviewOpen && (
        <Suspense fallback={null}>
          <DraftReviewDialog
            // Keyed by day: opening review on a different date remounts it, so
            // the card index and the total field start clean without an effect.
            key={reviewDay}
            open={reviewOpen}
            localDate={reviewDay}
            onClose={() => setReviewOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
