import { useEffect, useMemo, useState } from "react";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import type { Task } from "@timetracker/core/schemas";
import { useAllTasks } from "@/hooks/useTasks";
import { useEntriesRange } from "@/hooks/useEntries";
import { useDayRollover } from "@/hooks/useDayRollover";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { childrenIndex, planFlag, type PlanFlag } from "@/lib/planState";

const NO_TASKS: Task[] = [];

/** A minute clock: a block "ends" at minute resolution, and so does its mark. */
function useMinuteNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Every open task's plan flag (see lib/planState), keyed by task id.
 *
 * Today's entries come from the same ["time-entries", since, until] query the
 * day ribbon reads, so this is a cache hit, not a second fetch. Until that
 * query has loaded, nothing is flagged missed: unknown is never drawn as
 * "you didn't do it".
 */
export function usePlanFlags(tasks?: Task[]): Map<string, PlanFlag> {
  const { data: allTasks } = useAllTasks(tasks === undefined);
  const source = tasks ?? allTasks ?? NO_TASKS;
  const dayKey = useDayRollover();
  const today = useMemo(() => parseISO(dayKey), [dayKey]);
  const { data: entries, isSuccess } = useEntriesRange(
    startOfDay(today).toISOString(),
    endOfDay(today).toISOString()
  );
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const dismissedList = useUIStore((s) => s.dismissedPlanFlags);
  const now = useMinuteNow();

  return useMemo(() => {
    const flags = new Map<string, PlanFlag>();
    const ctx = {
      now,
      today: dayKey,
      entries: entries ?? [],
      runningEntry,
      childrenOf: childrenIndex(source),
      dismissed: new Set(dismissedList),
    };
    for (const task of source) {
      const flag = planFlag(task, ctx);
      if (!flag) continue;
      if (flag.kind === "missed" && !isSuccess) continue;
      flags.set(task.id, flag);
    }
    return flags;
  }, [source, entries, isSuccess, runningEntry, dismissedList, now, dayKey]);
}
