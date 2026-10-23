import { format } from "date-fns";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ClipboardCopy, Download, Lock, LockOpen } from "lucide-react";
import type { WeekDayFlag, WeekReview, WeekReviewDay } from "@timetracker/core/schemas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ColorDot } from "@/components/ColorDot";
import { useCloseWeek, useReopenWeek, useWeekReview } from "@/hooks/useWeekReview";
import { useUIStore } from "@/stores/uiStore";
import { formatDurationShort } from "@/lib/dateUtils";
import { exportRowsToCSV } from "@/lib/exportUtils";
import { dateToLocalDate, localDateToDate } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";

const dayName = (date: string) => format(localDateToDate(date), "EEE d");
const shiftWeek = (weekStart: string, weeks: number) => {
  const d = localDateToDate(weekStart);
  d.setDate(d.getDate() + weeks * 7);
  return dateToLocalDate(d);
};

/** Decimal hours, for the systems the hours are copied into. Two places is a quarter-hour's worth of honesty. */
const decimalHours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;

function weekTitle(weekStart: string): string {
  const first = localDateToDate(weekStart);
  const last = localDateToDate(shiftWeek(weekStart, 1));
  last.setDate(last.getDate() - 1);
  return first.getMonth() === last.getMonth()
    ? `${format(first, "d")}–${format(last, "d MMM yyyy")}`
    : `${format(first, "d MMM")} – ${format(last, "d MMM yyyy")}`;
}

/** One flag, in the words a person would use about their own day. */
function flagText(flag: WeekDayFlag): string {
  switch (flag.kind) {
    case "short":
      return `Short: ${formatDurationShort(flag.trackedSeconds)} of ${formatDurationShort(flag.expectedSeconds)}`;
    case "long":
      return `Long: ${formatDurationShort(flag.trackedSeconds)} against ${formatDurationShort(flag.expectedSeconds)}`;
    case "off_day_work":
      return "Time logged on a day off";
    case "overlap":
      return `${formatDurationShort(flag.seconds)} counted twice (${flag.count} overlap${flag.count === 1 ? "" : "s"})`;
    case "no_project":
      return `${formatDurationShort(flag.seconds)} with no project`;
    case "running":
      return "Timer still running";
    case "drafts":
      return `${flag.count} draft${flag.count === 1 ? "" : "s"} to review`;
  }
}

const OFF_LABEL = { full: "Day off", am: "Morning off", pm: "Afternoon off" } as const;

function DayLine({ day }: { day: WeekReviewDay }) {
  const quiet = day.flags.length === 0;
  return (
    <li className="flex items-baseline gap-3 py-1.5 text-sm">
      <span className="w-14 shrink-0 text-muted-foreground">{dayName(day.date)}</span>
      <span className="w-16 shrink-0 text-right font-mono tabular-nums">
        {day.trackedSeconds > 0 ? formatDurationShort(day.trackedSeconds) : "—"}
      </span>
      <span className="min-w-0 flex-1 text-xs leading-normal">
        {day.dayOff && <span className="text-muted-foreground">{OFF_LABEL[day.dayOff]}</span>}
        {day.dayOff && !quiet && <span className="text-muted-foreground"> · </span>}
        {day.flags.map((f, i) => (
          <span key={f.kind}>
            {i > 0 && <span className="text-muted-foreground"> · </span>}
            <span className="text-warning-ink">{flagText(f)}</span>
          </span>
        ))}
      </span>
    </li>
  );
}

function copyTable(review: WeekReview) {
  const header = ["Project", "Client", ...review.days.map((d) => d.date), "Total"];
  const lines = [
    header,
    ...review.rows.map((r) => [
      r.name,
      r.clientName ?? "",
      ...r.perDay.map(decimalHours),
      decimalHours(r.totalSeconds),
    ]),
  ];
  // Tab-separated so a paste lands one value per cell in a spreadsheet or a timesheet grid.
  void navigator.clipboard
    .writeText(lines.map((l) => l.join("\t")).join("\n"))
    .then(
      () => toast.success("Hours copied — paste them into your timesheet"),
      () => toast.error("Couldn't copy to the clipboard")
    );
}

function downloadCsv(review: WeekReview) {
  exportRowsToCSV(
    [
      ["Project", "Client", ...review.days.map((d) => d.date), "Total (hours)"],
      ...review.rows.map((r) => [
        r.name,
        r.clientName ?? "",
        ...r.perDay.map(decimalHours),
        decimalHours(r.totalSeconds),
      ]),
    ],
    `week-${review.weekStart}`
  );
}

/**
 * Closing a week: what looks off, the hours by project and day to copy into
 * another system, and — once closed — anything that changed afterwards and so
 * needs re-submitting. Mounted once in AppShell, opened via `uiStore.openWeekReview`.
 */
export function WeekReviewDialog() {
  const weekStart = useUIStore((s) => s.weekReviewStart);
  const openWeekReview = useUIStore((s) => s.openWeekReview);
  const closeWeekReview = useUIStore((s) => s.closeWeekReview);
  const review = useWeekReview(weekStart, { fresh: true });
  const close = useCloseWeek();
  const reopen = useReopenWeek();
  const timeFormat = useUIStore((s) => s.timeFormat);
  const closedAt = (iso: string) =>
    format(new Date(iso), timeFormat === "12h" ? "EEE d MMM, h:mm a" : "EEE d MMM, HH:mm");

  if (!weekStart) return null;
  const data = review.data?.weekStart === weekStart ? review.data : undefined;
  const flagged = data?.days.filter((d) => d.flags.length > 0).length ?? 0;
  const changes = data?.closure?.changes ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && closeWeekReview()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Week of {weekTitle(weekStart)}</DialogTitle>
            <div className="ml-auto flex items-center gap-1 pr-8">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous week"
                title="Previous week"
                onClick={() => openWeekReview(shiftWeek(weekStart, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next week"
                title="Next week"
                onClick={() => openWeekReview(shiftWeek(weekStart, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogDescription>
            {!data
              ? "Reading the week…"
              : data.closure
                ? changes.length > 0
                  ? `Closed ${closedAt(data.closure.closedAt)} — ${changes.length} change${changes.length === 1 ? "" : "s"} since, to re-submit.`
                  : `Closed ${closedAt(data.closure.closedAt)}. Nothing has changed since.`
                : flagged > 0
                  ? `${flagged} day${flagged === 1 ? "" : "s"} worth a look before you submit.`
                  : "Nothing looks off. Copy the hours, then close the week."}
          </DialogDescription>
        </DialogHeader>

        {review.isError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Couldn't load the week.</p>
            <Button variant="outline" size="sm" onClick={() => review.refetch()}>
              Try again
            </Button>
          </div>
        ) : !data ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <div className="max-h-[60vh] space-y-5 overflow-y-auto">
            {changes.length > 0 && (
              <section aria-label="Changed since closed">
                <h3 className="text-xs font-medium text-muted-foreground">Changed since you closed it</h3>
                <ul className="mt-1.5 divide-y divide-border rounded-container border">
                  {changes.map((c) => {
                    const delta = c.afterSeconds - c.beforeSeconds;
                    return (
                      <li key={`${c.projectId}:${c.date}`} className="flex items-baseline gap-3 px-3 py-1.5 text-sm">
                        <span className="w-14 shrink-0 text-muted-foreground">{dayName(c.date)}</span>
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {formatDurationShort(c.beforeSeconds)} → {formatDurationShort(c.afterSeconds)}
                        </span>
                        <span
                          className={cn(
                            "w-14 shrink-0 text-right font-mono text-xs tabular-nums",
                            delta > 0 ? "text-foreground" : "text-destructive"
                          )}
                        >
                          {delta > 0 ? "+" : "−"}
                          {formatDurationShort(Math.abs(delta))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section aria-label="Days">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-medium text-muted-foreground">Days</h3>
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums text-foreground">
                    {formatDurationShort(data.totalSeconds)}
                  </span>
                  {data.expectedSeconds > 0 && (
                    <>
                      {" "}
                      of{" "}
                      <span className="font-mono tabular-nums">
                        {formatDurationShort(data.expectedSeconds)}
                      </span>{" "}
                      working hours
                    </>
                  )}
                </span>
              </div>
              <ul className="mt-1 divide-y divide-border">
                {data.days.map((d) => (
                  <DayLine key={d.date} day={d} />
                ))}
              </ul>
            </section>

            <section aria-label="Hours by project">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">Hours by project</h3>
                {data.rows.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="xs" className="gap-1.5" onClick={() => copyTable(data)}>
                      <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
                      Copy table
                    </Button>
                    <Button variant="ghost" size="xs" className="gap-1.5" onClick={() => downloadCsv(data)}>
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      CSV
                    </Button>
                  </div>
                )}
              </div>
              {data.rows.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">Nothing tracked this week.</p>
              ) : (
                <div className="mt-1.5 overflow-x-auto rounded-container border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="px-3 py-1.5 text-left font-medium">Project</th>
                        {data.days.map((d) => (
                          <th key={d.date} className="px-1.5 py-1.5 text-right font-medium">
                            {format(localDateToDate(d.date), "EEE")}
                          </th>
                        ))}
                        <th className="px-3 py-1.5 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.rows.map((r) => (
                        <tr key={r.projectId ?? "none"}>
                          {/* Names wrap rather than truncate: the engagement code
                              is usually at the end, and it's the part being copied. */}
                          <td className="min-w-48 px-3 py-1.5">
                            <span className="flex min-w-0 items-start gap-2">
                              {r.color && <ColorDot color={r.color} className="mt-1.5" />}
                              <span className={cn("break-words", !r.projectId && "text-warning-ink")}>
                                {r.name}
                              </span>
                            </span>
                          </td>
                          {r.perDay.map((s, i) => (
                            <td
                              key={data.days[i].date}
                              className="px-1.5 py-1.5 text-right font-mono text-xs tabular-nums"
                            >
                              {s > 0 ? formatDurationShort(s) : <span className="text-muted-foreground">·</span>}
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                            {formatDurationShort(r.totalSeconds)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          {data?.closure && (
            <Button
              variant="ghost"
              className="gap-1.5 sm:mr-auto"
              disabled={reopen.isPending}
              onClick={() => reopen.mutate(weekStart)}
            >
              {reopen.isPending ? <Spinner size="sm" /> : <LockOpen className="h-4 w-4" aria-hidden />}
              Reopen
            </Button>
          )}
          <Button variant="ghost" onClick={closeWeekReview}>
            Done
          </Button>
          {data && (!data.closure || changes.length > 0) && (
            <Button
              className="gap-1.5"
              disabled={close.isPending}
              onClick={() =>
                close.mutate(weekStart, {
                  onSuccess: () => toast.success(data.closure ? "Week closed again" : "Week closed"),
                })
              }
            >
              {close.isPending ? <Spinner size="sm" /> : <Lock className="h-4 w-4" aria-hidden />}
              {data.closure ? "Close again" : "Close week"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
