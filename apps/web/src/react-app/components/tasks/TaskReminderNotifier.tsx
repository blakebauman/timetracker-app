import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAllTasks } from "@/hooks/useTasks";
import { useTimer } from "@/hooks/useTimer";
import { useAssistantStore } from "@/stores/assistantStore";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { notify } from "@/lib/notify";
import { formatMinute, scheduledBlock } from "@/lib/taskUtils";
import type { Task } from "@timetracker/core/schemas";

/** Only blocks starting within this window get a timer; the rest wait for a later pass. */
const LOOKAHEAD_MS = 6 * 60 * 60_000;
/** Re-plan this often, so a block beyond the lookahead is picked up in time. */
const REPLAN_MS = 30 * 60_000;

/**
 * Headless: when a scheduled task's block starts, say so — a toast with a
 * one-click Start, plus a browser notification when the tab is hidden.
 *
 * Client-side on purpose. A block's time is a *local* minute on a *local* day,
 * and the browser is the one place that knows the user's clock; the worker
 * runs in UTC and has no business deciding when "9am" is. Rides the same
 * switch as the Assistant's alerts (Settings → Productivity), so there is one
 * place to turn interruptions off. Mounted once in AppShell.
 */
export function TaskReminderNotifier() {
  const { data: tasks = [] } = useAllTasks();
  const alertsEnabled = useAssistantStore((s) => s.alertsEnabled);
  const timeFormat = useUIStore((s) => s.timeFormat);
  const [tick, setTick] = useState(0);

  // A toast's action outlives the render that made it; read the current
  // startTimer at click time (same reasoning as AssistantNudgeNotifier).
  const { startTimer } = useTimer();
  const startTimerRef = useRef(startTimer);
  useEffect(() => {
    startTimerRef.current = startTimer;
  }, [startTimer]);

  // Blocks already announced in this tab, keyed by task + start, so a refetch
  // that re-runs the effect can't announce the same start twice.
  const announced = useRef(new Set<string>());

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REPLAN_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!alertsEnabled) return;
    const now = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];

    const announce = (task: Task, key: string, minute: number) => {
      if (announced.current.has(key)) return;
      announced.current.add(key);
      // Already on it: the reminder would be about the thing you're doing.
      if (useTimerStore.getState().runningEntry?.taskId === task.id) return;
      const title = `${task.name} — ${formatMinute(minute, timeFormat)}`;
      toast(title, {
        id: `task-reminder:${key}`,
        description: "Scheduled to start now.",
        duration: 30_000,
        action: {
          label: "Start timer",
          onClick: () =>
            startTimerRef.current({ description: task.name, projectId: task.projectId, taskId: task.id }),
        },
      });
      if (document.hidden) notify(title, "Scheduled to start now.");
    };

    for (const task of tasks) {
      if (!task.active) continue;
      const block = scheduledBlock(task);
      if (!block || task.scheduledMinute === null) continue;
      const delay = block.start.getTime() - now;
      if (delay <= 0 || delay > LOOKAHEAD_MS) continue;
      const key = `${task.id}@${block.start.toISOString()}`;
      const minute = task.scheduledMinute;
      timers.push(setTimeout(() => announce(task, key, minute), delay));
    }
    return () => timers.forEach(clearTimeout);
  }, [tasks, alertsEnabled, timeFormat, tick]);

  return null;
}
