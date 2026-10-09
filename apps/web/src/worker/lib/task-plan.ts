/**
 * The plan side of a day, for the digest and the Assistant's nudges: what's
 * overdue, what's due, and which deadlines are close.
 *
 * Deterministic, like lib/pacing.ts. These lines go in front of the user as
 * statements of fact ("3 tasks are overdue"), so they must be reproducible from
 * the rows alone. All dates are the user's *local* days, passed in by the
 * caller — the worker runs in UTC and never derives "today" itself.
 */
import { compareLocalDates, daysBetweenLocal } from "@timetracker/core/task-recurrence";

/** A deadline this many days out (or nearer) with the task still open is a risk. */
export const DEADLINE_HORIZON_DAYS = 2;

export interface PlannedTask {
  id: string;
  name: string;
  projectName: string | null;
  dueDate: string | null;
  scheduledMinute: number | null;
  deadlineDate: string | null;
  estimatedSeconds: number | null;
  /** Own + subtasks', like the task list's rollup. */
  trackedSeconds: number;
}

export interface DeadlineRisk {
  task: PlannedTask;
  /** Negative once missed, 0 = today. */
  daysLeft: number;
  /** Estimate minus tracked, when there is an estimate and it isn't used up. */
  remainingSeconds: number | null;
}

export interface TaskPlan {
  /** Open top-level tasks due before `fromLocal`. */
  overdue: number;
  /** Their ids, so a caller that names some of them elsewhere can count the rest. */
  overdueIds: string[];
  /** Open top-level tasks due within [fromLocal, toLocal], scheduled ones first by time. */
  due: PlannedTask[];
  /** Sum of the due tasks' remaining estimates. */
  remainingEstimateSeconds: number;
  deadlines: DeadlineRisk[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today" / "tomorrow" / "yesterday" / "Fri 2 Oct" for a local day `daysLeft` from today. */
export function describeDay(localDate: string, daysLeft: number): string {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft === -1) return "yesterday";
  const [y, m, d] = localDate.split("-").map(Number);
  // A calendar day has no timezone; read its weekday in UTC so the worker's
  // own zone can't shift it.
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

function remaining(t: PlannedTask): number | null {
  if (!t.estimatedSeconds) return null;
  return Math.max(0, t.estimatedSeconds - t.trackedSeconds);
}

/** Open tasks with a deadline that has passed or falls within the horizon. */
export function deadlineRisks(tasks: PlannedTask[], todayLocal: string): DeadlineRisk[] {
  return tasks
    .filter((t) => t.deadlineDate)
    .map((t) => ({ task: t, daysLeft: daysBetweenLocal(todayLocal, t.deadlineDate!), remainingSeconds: remaining(t) }))
    .filter((r) => r.daysLeft <= DEADLINE_HORIZON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * Load every open top-level task with a due date or a deadline, and cut the
 * plan for a local window. `fromLocal === toLocal` for a single day.
 */
export async function loadTaskPlan(
  db: D1Database,
  workspaceId: string,
  fromLocal: string,
  toLocal: string
): Promise<TaskPlan> {
  const { results } = await db
    .prepare(
      `SELECT tk.id, tk.name, p.name AS project_name, tk.due_date, tk.scheduled_minute,
              tk.deadline_date, tk.estimated_seconds,
              (SELECT COALESCE(SUM(te.duration), 0) FROM time_entries te
                 WHERE te.workspace_id = tk.workspace_id AND te.stop IS NOT NULL
                   AND (te.task_id = tk.id
                        OR te.task_id IN (SELECT c.id FROM tasks c WHERE c.parent_id = tk.id))
              ) AS tracked_seconds
       FROM tasks tk
       LEFT JOIN projects p ON p.id = tk.project_id AND p.workspace_id = tk.workspace_id
       WHERE tk.workspace_id = ? AND tk.active = 1 AND tk.parent_id IS NULL
         AND (tk.due_date IS NOT NULL OR tk.deadline_date IS NOT NULL)`
    )
    .bind(workspaceId)
    .all<Record<string, unknown>>();

  const tasks: PlannedTask[] = results.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    projectName: (r.project_name as string | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    scheduledMinute: (r.scheduled_minute as number | null) ?? null,
    deadlineDate: (r.deadline_date as string | null) ?? null,
    estimatedSeconds: (r.estimated_seconds as number | null) ?? null,
    trackedSeconds: (r.tracked_seconds as number) ?? 0,
  }));

  const overdueIds = tasks
    .filter((t) => t.dueDate && compareLocalDates(t.dueDate, fromLocal) < 0)
    .map((t) => t.id);
  const due = tasks
    .filter(
      (t) =>
        t.dueDate &&
        compareLocalDates(t.dueDate, fromLocal) >= 0 &&
        compareLocalDates(t.dueDate, toLocal) <= 0
    )
    .sort(
      (a, b) =>
        compareLocalDates(a.dueDate!, b.dueDate!) ||
        (a.scheduledMinute ?? 24 * 60) - (b.scheduledMinute ?? 24 * 60) ||
        a.name.localeCompare(b.name)
    );

  return {
    overdue: overdueIds.length,
    overdueIds,
    due,
    remainingEstimateSeconds: due.reduce((sum, t) => sum + (remaining(t) ?? 0), 0),
    deadlines: deadlineRisks(tasks, fromLocal),
  };
}
