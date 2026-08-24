// Project budget pacing: how much of a project's time budget is spent, how fast
// it's being spent, and whether the current burn lands it over budget before its
// end date.
//
// Deliberately deterministic — no AI anywhere. Pacing is the number a consultant
// puts in front of a client, so it has to be reproducible and explainable from
// the entries alone. The AI features (drafts, briefings) *read* pacing; they
// never compute it.

/** Trailing window the burn rate is measured over. */
export const BURN_WINDOW_DAYS = 14;

export type PacingStatus =
  | "no_budget" // no estimated_hours set — nothing to pace against
  | "on_track"
  | "at_risk" // projected to exceed, or already close enough to warrant a look
  | "over_budget"; // tracked time has already passed the estimate

export interface PacingInput {
  projectId: string;
  projectName: string;
  projectColor: string;
  clientName: string | null;
  estimatedSeconds: number | null;
  trackedSeconds: number;
  /** Seconds tracked inside the trailing burn window. */
  recentSeconds: number;
  billableAmount: number;
  startDate: string | null;
  endDate: string | null;
  lastTracked: string | null;
}

export interface ProjectPacing extends PacingInput {
  /** 0–1+, null when there's no budget. Not clamped: 1.2 means 20% over. */
  percentUsed: number | null;
  /** Mean seconds per *working* day over the trailing window. */
  burnPerWorkingDay: number;
  /** Working days from today up to and including endDate. Null with no endDate. */
  workingDaysRemaining: number | null;
  /** tracked + burn × workingDaysRemaining. Null when it can't be projected. */
  projectedSeconds: number | null;
  /** How far the projection lands past the budget (0 when it doesn't). */
  projectedOverrunSeconds: number | null;
  status: PacingStatus;
}

/** At/over this share of the budget a project is worth a second look regardless of dates. */
const AT_RISK_THRESHOLD = 0.85;

/** Mon–Fri days in [from, to], inclusive of both ends. Negative ranges → 0. */
export function countWorkingDays(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (end < start) return 0;
  let count = 0;
  for (let d = start; d <= end; d += 86_400_000) {
    const weekday = new Date(d).getUTCDay();
    if (weekday >= 1 && weekday <= 5) count++;
  }
  return count;
}

/**
 * Derive the pacing view of one project.
 *
 * `nowMs` is passed in rather than read from the clock so the same inputs always
 * produce the same output — this runs in a cron-driven digest as well as behind
 * a request, and both have to agree.
 */
export function computePacing(input: PacingInput, nowMs: number): ProjectPacing {
  const { estimatedSeconds, trackedSeconds, recentSeconds, endDate } = input;

  // Working days, not calendar days: a 14-day window holds 10 of them, and a
  // consultant's burn is a per-working-day number. Dividing by 14 understates
  // the rate by 30% and quietly turns every overrun projection into "on track".
  const windowWorkingDays = countWorkingDays(
    new Date(nowMs - (BURN_WINDOW_DAYS - 1) * 86_400_000),
    new Date(nowMs)
  );
  const burnPerWorkingDay = windowWorkingDays > 0 ? recentSeconds / windowWorkingDays : 0;

  const workingDaysRemaining = endDate
    ? countWorkingDays(new Date(nowMs), new Date(`${endDate.slice(0, 10)}T00:00:00Z`))
    : null;

  if (!estimatedSeconds || estimatedSeconds <= 0) {
    return {
      ...input,
      percentUsed: null,
      burnPerWorkingDay,
      workingDaysRemaining,
      projectedSeconds: null,
      projectedOverrunSeconds: null,
      status: "no_budget",
    };
  }

  const percentUsed = trackedSeconds / estimatedSeconds;

  // Only project forward when there's both a deadline to project to and a burn
  // rate to project with. A dormant project (no recent time) is not "on pace to
  // overrun" — it isn't on pace at all, and saying so would cry wolf.
  const projectedSeconds =
    workingDaysRemaining !== null && burnPerWorkingDay > 0
      ? trackedSeconds + burnPerWorkingDay * workingDaysRemaining
      : null;
  const projectedOverrunSeconds =
    projectedSeconds !== null ? Math.max(0, projectedSeconds - estimatedSeconds) : null;

  let status: PacingStatus;
  if (percentUsed >= 1) status = "over_budget";
  else if (projectedOverrunSeconds !== null && projectedOverrunSeconds > 0) status = "at_risk";
  else if (percentUsed >= AT_RISK_THRESHOLD) status = "at_risk";
  else status = "on_track";

  return {
    ...input,
    percentUsed,
    burnPerWorkingDay,
    workingDaysRemaining,
    projectedSeconds,
    projectedOverrunSeconds,
    status,
  };
}

/**
 * Pacing for every active project in a workspace, budgeted or not, newest
 * activity first. One query: the trailing-window sum is a conditional aggregate
 * over the same join as the lifetime sum rather than a second pass.
 */
export async function loadProjectPacing(
  db: D1Database,
  workspaceId: string,
  nowMs: number = Date.now()
): Promise<ProjectPacing[]> {
  const windowStart = new Date(nowMs - BURN_WINDOW_DAYS * 86_400_000).toISOString();

  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.color, p.estimated_hours, p.start_date, p.end_date, p.rate,
              c.name AS client_name,
              COALESCE(SUM(te.duration), 0) AS tracked_seconds,
              COALESCE(SUM(CASE WHEN te.start >= ?2 THEN te.duration ELSE 0 END), 0) AS recent_seconds,
              COALESCE(SUM(CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END), 0) AS billable_seconds,
              MAX(te.start) AS last_tracked
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
       LEFT JOIN time_entries te
         ON te.project_id = p.id AND te.workspace_id = p.workspace_id AND te.stop IS NOT NULL
       WHERE p.workspace_id = ?1 AND p.active = 1
       GROUP BY p.id
       ORDER BY last_tracked DESC, p.name ASC`
    )
    .bind(workspaceId, windowStart)
    .all<Record<string, unknown>>();

  return results.map((row) => {
    const estimatedHours = (row.estimated_hours as number | null) ?? null;
    const rate = (row.rate as number | null) ?? 0;
    return computePacing(
      {
        projectId: row.id as string,
        projectName: row.name as string,
        projectColor: row.color as string,
        clientName: (row.client_name as string | null) ?? null,
        estimatedSeconds: estimatedHours ? Math.round(estimatedHours * 3600) : null,
        trackedSeconds: (row.tracked_seconds as number) ?? 0,
        recentSeconds: (row.recent_seconds as number) ?? 0,
        billableAmount: (((row.billable_seconds as number) ?? 0) / 3600) * rate,
        startDate: (row.start_date as string | null) ?? null,
        endDate: (row.end_date as string | null) ?? null,
        lastTracked: (row.last_tracked as string | null) ?? null,
      },
      nowMs
    );
  });
}

/** Budgeted projects that need attention, worst first. Used by nudges + digests. */
export function atRiskProjects(pacing: ProjectPacing[]): ProjectPacing[] {
  const rank: Record<PacingStatus, number> = {
    over_budget: 0,
    at_risk: 1,
    on_track: 2,
    no_budget: 3,
  };
  return pacing
    .filter((p) => p.status === "over_budget" || p.status === "at_risk")
    .sort((a, b) => rank[a.status] - rank[b.status] || (b.percentUsed ?? 0) - (a.percentUsed ?? 0));
}
