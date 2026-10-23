import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange } from "lucide-react";
import type { Task } from "@timetracker/core/schemas";
import { api, type DayPlan } from "@/lib/api";
import { useUpdateTask } from "@/hooks/useTasks";
import { useUIStore } from "@/stores/uiStore";
import { formatMinute, workdayLabel } from "@/lib/taskUtils";
import { formatDurationShort } from "@/lib/dateUtils";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * "Plan my day" without the chat: the same deterministic placement the
 * Assistant's `planDay` tool uses (`GET /api/assistant/plan-day`), shown as a
 * proposal, applied only when you say so.
 *
 * Applying is ordinary task updates — the task's day and time of day — so the
 * blocks land on the grid like any you dragged there, and one Undo puts every
 * task back where it was.
 */
export function PlanMyDay({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const timeFormat = useUIStore((s) => s.timeFormat);
  const queryClient = useQueryClient();
  const updateTask = useUpdateTask();
  const [applying, setApplying] = useState(false);

  // Fetched on open and never cached between opens: a plan is "from now", and
  // one made at 9:00 is wrong by 11:00.
  const plan = useQuery({
    queryKey: ["plan-day"],
    queryFn: () => api.assistant.planDay(new Date().getTimezoneOffset()),
    enabled: open,
    gcTime: 0,
    staleTime: 0,
  });

  const apply = async (p: DayPlan) => {
    const before = new Map(tasks.map((t) => [t.id, t]));
    setApplying(true);
    try {
      await Promise.all(
        p.placed.map((slot) =>
          updateTask.mutateAsync({
            id: slot.taskId,
            data: { dueDate: p.localDate, scheduledMinute: slot.startMinute },
          })
        )
      );
    } catch {
      // useUpdateTask already rolled the cache back and said what failed.
      setApplying(false);
      return;
    }
    setApplying(false);
    setOpen(false);
    const n = p.placed.length;
    toast.success(`Scheduled ${n} ${n === 1 ? "task" : "tasks"} for today`, {
      action: {
        label: "Undo",
        onClick: () => {
          for (const slot of p.placed) {
            const prev = before.get(slot.taskId);
            if (!prev) continue;
            updateTask.mutate({
              id: slot.taskId,
              data: { dueDate: prev.dueDate, scheduledMinute: prev.scheduledMinute },
            });
          }
        },
      },
    });
    queryClient.removeQueries({ queryKey: ["plan-day"] });
  };

  const data = plan.data;
  const overEstimate = new Set(
    tasks
      .filter((t) => t.estimatedSeconds && t.trackedSeconds >= t.estimatedSeconds)
      .map((t) => t.id)
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="gap-1.5">
          <CalendarRange aria-hidden className="h-3.5 w-3.5" />
          Plan my day
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">
            {data?.dayOff === "full"
              ? "You're off today"
              : data && data.placed.length === 0 && data.unplaced.length === 0
                ? "Nothing left to plan today"
                : "The rest of today"}
          </h3>
          {data && data.dayOff !== "full" && (
            <span className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">
                {formatDurationShort(data.freeMinutes * 60)}
              </span>{" "}
              free
            </span>
          )}
        </div>

        {plan.isPending ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" />
            Fitting today's tasks around your calendar…
          </p>
        ) : plan.isError ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Couldn't build a plan.</p>
            <Button variant="outline" size="xs" onClick={() => plan.refetch()}>
              Try again
            </Button>
          </div>
        ) : data ? (
          <>
            {data.placed.length > 0 && (
              // Start time first, in mono, so the column reads down like the
              // grid the blocks will land on.
              <ol className="mt-3 flex flex-col gap-1.5 text-sm">
                {data.placed.map((slot) => (
                  <li key={slot.taskId} className="flex items-baseline gap-2">
                    <span className="w-28 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatMinute(slot.startMinute, timeFormat)}–
                      {formatMinute(slot.startMinute + slot.minutes, timeFormat)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{slot.name}</span>
                    {/* The plan gives a spent estimate the minimum slot; say so,
                        rather than let a task past its estimate pass as on track. */}
                    {overEstimate.has(slot.taskId) && (
                      <span className="shrink-0 text-xs text-warning-ink">over estimate</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {data.dayOff === "full" && (
              <p className="mt-2 text-sm text-muted-foreground">
                Today is booked as a day off, so nothing is planned into it. Move
                what's due to another day from the plan column.
              </p>
            )}
            {data.unplaced.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">Doesn't fit today</p>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {data.unplaced.map((t) => (
                    <li key={t.taskId} className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDurationShort(t.minutes * 60)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.dayOff !== "full" && data.placed.length === 0 && data.unplaced.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Every task due today already has a time, or there's nothing due.
              </p>
            )}
            {/* What the plan assumed, and where to change it: a proposal that
                stops at 17:30 for someone who works till 19:00 is only
                legible if it says so. */}
            <p className="mt-3 text-xs text-muted-foreground">
              {data.dayOff === "full" ? (
                "Days off are under Settings → General"
              ) : (
                <>
                  Within your working hours
                  {data.dayOff && ` (${data.dayOff === "am" ? "morning" : "afternoon"} off)`},{" "}
                  <span className="font-mono tabular-nums">
                    {workdayLabel(data.workday.start, timeFormat)}–{workdayLabel(data.workday.end, timeFormat)}
                  </span>
                </>
              )}
              {" · "}
              <Link
                to="/settings"
                className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                Change
              </Link>
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {data.placed.length > 0 ? "Not now" : "Close"}
              </Button>
              {data.placed.length > 0 && (
                <Button size="sm" disabled={applying} onClick={() => apply(data)}>
                  {applying && <Spinner size="sm" />}
                  Schedule {data.placed.length} {data.placed.length === 1 ? "task" : "tasks"}
                </Button>
              )}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
