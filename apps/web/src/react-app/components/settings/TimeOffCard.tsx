import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Palmtree, Plus, Trash2 } from "lucide-react";
import type { DayOff, DayOffPortion } from "@timetracker/core/schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker } from "@/components/ui/date-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { useCreateDaysOff, useDaysOff, useDeleteDaysOff } from "@/hooks/useDaysOff";
import { useDayRollover } from "@/hooks/useDayRollover";
import { dateToLocalDate, localDateToDate } from "@/lib/taskUtils";

const PORTIONS: { value: DayOffPortion; label: string }[] = [
  { value: "full", label: "Whole day" },
  { value: "am", label: "Morning" },
  { value: "pm", label: "Afternoon" },
];

const PORTION_LABEL: Record<DayOffPortion, string> = {
  full: "",
  am: "Morning off",
  pm: "Afternoon off",
};

interface Run {
  ids: string[];
  first: string;
  last: string;
  portion: DayOffPortion;
  label: string;
}

/** The next weekday after a local date, so Fri → Mon counts as consecutive. */
function nextWeekday(date: string): string {
  const d = localDateToDate(date);
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6);
  return dateToLocalDate(d);
}

/**
 * Consecutive working days booked with the same label and portion read as one
 * stretch of leave — which is how they were booked and how they'd be removed.
 */
function toRuns(days: DayOff[]): Run[] {
  const runs: Run[] = [];
  for (const d of days) {
    const prev = runs[runs.length - 1];
    if (
      prev &&
      prev.portion === "full" &&
      d.portion === "full" &&
      prev.label === d.label &&
      nextWeekday(prev.last) === d.date
    ) {
      prev.ids.push(d.id);
      prev.last = d.date;
    } else {
      runs.push({ ids: [d.id], first: d.date, last: d.date, portion: d.portion, label: d.label });
    }
  }
  return runs;
}

const day = (date: string) => format(localDateToDate(date), "EEE d MMM");

function runLabel(run: Run): string {
  return run.first === run.last ? day(run.first) : `${day(run.first)} – ${day(run.last)}`;
}

function runDescription(run: Run): string {
  const parts = [
    run.ids.length > 1 ? `${run.ids.length} working days` : PORTION_LABEL[run.portion] || "Whole day",
  ];
  if (run.label) parts.unshift(run.label);
  return parts.join(" · ");
}

/**
 * Days off: PTO, bank holidays, half days. Booking one takes it out of budget
 * pacing's working days, quiets the empty-timesheet nudge and the morning
 * briefing, and leaves Plan my day nothing (or half a day) to fill.
 */
export function TimeOffCard() {
  const today = useDayRollover();
  const { data = [], isLoading } = useDaysOff();
  const remove = useDeleteDaysOff();
  const [adding, setAdding] = useState(false);

  const upcoming = useMemo(() => toRuns(data.filter((d) => d.date >= today)), [data, today]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Palmtree className="h-4 w-4" aria-hidden />
          Time off
        </CardTitle>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : upcoming.length === 0 ? (
          <p className="text-sm leading-normal text-muted-foreground">
            Book holidays, bank holidays and half days. Budget pacing stops counting them as
            working days, and reminders and the morning briefing stay quiet on them.
          </p>
        ) : (
          upcoming.map((run) => {
            const isRemoving = remove.isPending && remove.variables === run.ids;
            return (
              <SettingsRow
                key={run.ids[0]}
                label={<span className="truncate font-mono tabular-nums">{runLabel(run)}</span>}
                description={runDescription(run)}
                trailing={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(run.ids)}
                    disabled={isRemoving}
                    aria-label={`Remove time off ${runLabel(run)}`}
                    title="Remove"
                  >
                    {isRemoving ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                }
              />
            );
          })
        )}
      </CardContent>

      {adding && <AddTimeOffDialog today={today} onClose={() => setAdding(false)} />}
    </Card>
  );
}

function AddTimeOffDialog({ today, onClose }: { today: string; onClose: () => void }) {
  const create = useCreateDaysOff();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [portion, setPortion] = useState<DayOffPortion>("full");
  const [label, setLabel] = useState("");

  const singleDay = from === to;
  const submit = () =>
    create.mutate(
      { from, to: singleDay ? undefined : to, portion: singleDay ? portion : "full", label },
      { onSuccess: onClose }
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add time off</DialogTitle>
          <DialogDescription>
            A range books its weekdays. Booking a day again replaces it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <DatePicker
                value={localDateToDate(from)}
                onSelect={(d) => {
                  const next = dateToLocalDate(d);
                  setFrom(next);
                  if (to < next) setTo(next);
                }}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <DatePicker
                value={localDateToDate(to)}
                onSelect={(d) => {
                  const next = dateToLocalDate(d);
                  setTo(next < from ? from : next);
                }}
                className="w-full"
              />
            </div>
          </div>

          {/* Half days are a single-day thing; a range is always whole days. */}
          {singleDay && (
            <div className="space-y-1.5">
              <Label>Off for</Label>
              <SegmentedControl
                label="Off for"
                value={portion}
                options={PORTIONS}
                onChange={setPortion}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="time-off-label">Label (optional)</Label>
            <Input
              id="time-off-label"
              value={label}
              maxLength={60}
              placeholder="Holiday, bank holiday…"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Spinner size="sm" />}
            Add time off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
