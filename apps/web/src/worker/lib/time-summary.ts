/**
 * Tracked time over [since, until), by project — the Assistant's "how much did
 * I track?" answer. Unlike Reports (completed entries only: an invoice can't
 * bill a timer that hasn't stopped), a running timer counts up to now, or to
 * the range's end for a range already over. Completed entries alone answered
 * "0 hours today" to someone five hours into a timer, and disagreed with the
 * timesheet behind the panel.
 *
 * Takes the narrowest slice of D1 it needs so e2e can run it against the local
 * database directly.
 */
export interface SummaryDb {
  prepare(sql: string): {
    bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> };
  };
}

export interface TimeSummaryRow {
  project: string;
  seconds: number;
  billableSeconds: number;
  entries: number;
}

export interface TimeSummary {
  totalSeconds: number;
  billableSeconds: number;
  /** The running timer's share of the total; 0 when nothing in range is running. */
  runningSeconds: number;
  byProject: TimeSummaryRow[];
}

export async function summarizeTime(
  db: SummaryDb,
  workspaceId: string,
  since: string,
  until: string,
  nowMs = Date.now()
): Promise<TimeSummary> {
  const cap = new Date(Math.min(nowMs, Date.parse(until))).toISOString();
  const { results } = await db
    .prepare(
      `WITH t AS (
         SELECT te.project_id, te.billable,
                CASE WHEN te.stop IS NULL
                     THEN MAX(0, CAST(ROUND((julianday(?) - julianday(te.start)) * 86400) AS INTEGER))
                     ELSE te.duration END AS secs,
                te.stop IS NULL AS live
         FROM time_entries te
         WHERE te.workspace_id = ? AND te.start >= ? AND te.start < ?
       )
       SELECT COALESCE(p.name, 'No project') AS project,
              SUM(t.secs) AS seconds,
              SUM(CASE WHEN t.billable = 1 THEN t.secs ELSE 0 END) AS billable_seconds,
              SUM(CASE WHEN t.live THEN t.secs ELSE 0 END) AS running_seconds,
              COUNT(*) AS entries
       FROM t
       LEFT JOIN projects p ON p.id = t.project_id
       GROUP BY project ORDER BY seconds DESC`
    )
    .bind(cap, workspaceId, since, until)
    .all<{ project: string; seconds: number; billable_seconds: number; running_seconds: number; entries: number }>();
  const sum = (k: "seconds" | "billable_seconds" | "running_seconds") =>
    results.reduce((s, r) => s + (r[k] ?? 0), 0);
  return {
    totalSeconds: sum("seconds"),
    billableSeconds: sum("billable_seconds"),
    runningSeconds: sum("running_seconds"),
    byProject: results.map((r) => ({
      project: r.project,
      seconds: r.seconds ?? 0,
      billableSeconds: r.billable_seconds ?? 0,
      entries: r.entries,
    })),
  };
}
