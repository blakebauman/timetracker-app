// Email digests: a short morning briefing on what yesterday held, and a weekly
// version of the same for the week just gone.
//
// Every figure is computed deterministically from the entries — totals, the
// project split, the budget verdicts (lib/pacing.ts), the review backlog. The
// only AI element is one narrative paragraph, and it is dropped rather than
// padded when the model is unavailable: an email that fills its own space is
// one people stop opening.

import { sendEmail } from "./mailer";
import { DailyBriefEmail, type BriefBudgetLine, type BriefProjectLine } from "../emails/daily-brief";
import { atRiskProjects, loadProjectPacing } from "./pacing";
import { runBriefNarrative } from "./ai";

const APP_URL = "https://timetracker.run";
/** Top N projects in the split — past this it stops being a glance. */
const MAX_PROJECT_LINES = 6;
const MAX_BUDGET_LINES = 3;
/** Weekly digests go out on Monday, covering the seven days before it. */
const WEEKLY_SEND_WEEKDAY = 1;

export type DigestKind = "daily" | "weekly";

export interface DigestUser {
  id: string;
  email: string;
  name: string | null;
  workspaceId: string;
  timezoneOffsetMinutes: number;
}

function formatSeconds(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  // "2h", not "2h 0m" — the same shape formatDurationShort uses in the app.
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 'YYYY-MM-DD' → "Monday, Aug 24". Built by hand: no Intl data in the digest path. */
function formatLocalDate(localDate: string, withWeekday = true): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const stamp = `${MONTHS[m - 1]} ${d}`;
  return withWeekday ? `${weekday}, ${stamp}` : stamp;
}

/** The user's local calendar date at an instant. */
export function localDateAt(ms: number, offsetMinutes: number): string {
  return new Date(ms - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function shiftLocalDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** UTC instants bounding an inclusive range of the user's local dates. */
function utcBounds(sinceLocal: string, untilLocal: string, offsetMinutes: number) {
  const startMs = new Date(`${sinceLocal}T00:00:00Z`).getTime() + offsetMinutes * 60_000;
  const endMs =
    new Date(`${untilLocal}T00:00:00Z`).getTime() + offsetMinutes * 60_000 + 86_400_000;
  return { sinceIso: new Date(startMs).toISOString(), untilIso: new Date(endMs).toISOString() };
}

export interface DigestContent {
  subject: string;
  periodLabel: string;
  totalSeconds: number;
  entryCount: number;
  projects: BriefProjectLine[];
  budgets: BriefBudgetLine[];
  draftsWaiting: number;
  narrative: string | null;
  billableSeconds: number;
}

/** Plain-language budget verdict, matching what the Projects page says. */
function budgetVerdict(
  status: string,
  percentUsed: number | null,
  estimatedSeconds: number | null,
  trackedSeconds: number,
  projectedOverrunSeconds: number | null
): string {
  const budgetHours = Math.round((estimatedSeconds ?? 0) / 3600);
  if (status === "over_budget") {
    return `${formatSeconds(trackedSeconds - (estimatedSeconds ?? 0))} over its ${budgetHours}h budget`;
  }
  if (projectedOverrunSeconds && projectedOverrunSeconds > 0) {
    return `on pace to overrun by ${formatSeconds(projectedOverrunSeconds)}`;
  }
  return `at ${Math.round((percentUsed ?? 0) * 100)}% of its ${budgetHours}h budget`;
}

/**
 * Assemble one digest.
 *
 * `endLocalDate` is the last local day the digest covers — yesterday for a
 * daily brief, the Sunday just gone for a weekly one.
 */
export async function buildDigest(
  env: Env,
  user: DigestUser,
  kind: DigestKind,
  endLocalDate: string
): Promise<DigestContent> {
  const startLocalDate = kind === "weekly" ? shiftLocalDate(endLocalDate, -6) : endLocalDate;
  const { sinceIso, untilIso } = utcBounds(
    startLocalDate,
    endLocalDate,
    user.timezoneOffsetMinutes
  );

  const [totalsRow, projectRows, entryRows, draftRow, pacing] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(duration), 0) AS total,
              COALESCE(SUM(CASE WHEN billable = 1 THEN duration ELSE 0 END), 0) AS billable
       FROM time_entries
       WHERE workspace_id = ? AND stop IS NOT NULL AND start >= ? AND start < ?`
    )
      .bind(user.workspaceId, sinceIso, untilIso)
      .first<{ n: number; total: number; billable: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(p.name, 'No project') AS name,
              COALESCE(p.color, '#94a3b8') AS color,
              SUM(te.duration) AS seconds
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id AND p.workspace_id = te.workspace_id
       WHERE te.workspace_id = ? AND te.stop IS NOT NULL AND te.start >= ? AND te.start < ?
       GROUP BY te.project_id
       ORDER BY seconds DESC
       LIMIT ${MAX_PROJECT_LINES}`
    )
      .bind(user.workspaceId, sinceIso, untilIso)
      .all<{ name: string; color: string; seconds: number }>(),
    // Fed to the narrative writer. Capped well below the summariser's own limit
    // — a week of entries is plenty of material for one paragraph.
    env.DB.prepare(
      `SELECT te.description, te.start, te.duration, te.billable, p.name AS project_name
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id AND p.workspace_id = te.workspace_id
       WHERE te.workspace_id = ? AND te.stop IS NOT NULL AND te.start >= ? AND te.start < ?
       ORDER BY te.start ASC LIMIT 120`
    )
      .bind(user.workspaceId, sinceIso, untilIso)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM draft_entries
       WHERE workspace_id = ? AND user_id = ? AND local_date >= ? AND local_date <= ?`
    )
      .bind(user.workspaceId, user.id, startLocalDate, endLocalDate)
      .first<{ n: number }>(),
    loadProjectPacing(env.DB, user.workspaceId),
  ]);

  const totalSeconds = totalsRow?.total ?? 0;
  const entryCount = totalsRow?.n ?? 0;

  // Best-effort. A missing paragraph is invisible; a wrong one is worse than
  // none, and neither is worth failing the whole send over.
  const narrative = await runBriefNarrative(
    env.AI,
    entryRows.results.map((e) => ({
      description: (e.description as string) ?? "",
      projectName: (e.project_name as string | null) ?? null,
      start: e.start as string,
      duration: (e.duration as number | null) ?? null,
      billable: Boolean(e.billable),
    })),
    kind === "weekly" ? "week" : "day"
  );

  const budgets: BriefBudgetLine[] = atRiskProjects(pacing)
    .slice(0, MAX_BUDGET_LINES)
    .map((p) => ({
      name: p.projectName,
      verdict: budgetVerdict(
        p.status,
        p.percentUsed,
        p.estimatedSeconds,
        p.trackedSeconds,
        p.projectedOverrunSeconds
      ),
      over: p.status === "over_budget",
    }));

  const periodLabel =
    kind === "weekly"
      ? `Last week · ${formatLocalDate(startLocalDate, false)} – ${formatLocalDate(endLocalDate, false)}`
      : `Yesterday · ${formatLocalDate(endLocalDate)}`;

  return {
    subject:
      kind === "weekly"
        ? `Your week: ${formatSeconds(totalSeconds)} tracked`
        : `Yesterday: ${formatSeconds(totalSeconds)} tracked`,
    periodLabel,
    totalSeconds,
    billableSeconds: totalsRow?.billable ?? 0,
    entryCount,
    projects: projectRows.results.map((r) => ({
      name: r.name,
      color: r.color,
      seconds: r.seconds ?? 0,
    })),
    budgets,
    draftsWaiting: draftRow?.n ?? 0,
    narrative,
  };
}

/** Build and send one digest. Exported so the "send me one now" action reuses it. */
export async function sendDigest(
  env: Env,
  user: DigestUser,
  kind: DigestKind,
  endLocalDate: string
): Promise<DigestContent> {
  const content = await buildDigest(env, user, kind, endLocalDate);
  await sendEmail(
    env,
    user.email,
    content.subject,
    DailyBriefEmail({
      greetingName: user.name?.split(" ")[0] ?? null,
      periodLabel: content.periodLabel,
      totalLabel: formatSeconds(content.totalSeconds),
      billableLabel:
        content.billableSeconds > 0 ? formatSeconds(content.billableSeconds) : null,
      entryCount: content.entryCount,
      projects: content.projects,
      budgets: content.budgets,
      draftsWaiting: content.draftsWaiting,
      narrative: content.narrative,
      appUrl: APP_URL,
    })
  );
  return content;
}

interface DigestRow {
  id: string;
  email: string;
  name: string | null;
  digest_daily: number;
  digest_weekly: number;
  digest_hour: number;
  digest_tz_offset: number;
  digest_daily_sent: string | null;
  digest_weekly_sent: string | null;
  workspace_id: string | null;
}

/**
 * Cron entry point: send any digest that has come due.
 *
 * The 5-minute cron ticks twelve times inside the target hour, so the send is
 * made exactly-once by comparing the marker against the user's LOCAL date
 * rather than by locking. A user in a workspace they've been removed from gets
 * nothing rather than an error.
 */
export async function runDigests(env: Env, nowMs: number = Date.now()): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.digest_daily, u.digest_weekly, u.digest_hour,
            u.digest_tz_offset, u.digest_daily_sent, u.digest_weekly_sent,
            (SELECT m.organizationId FROM "member" m
              WHERE m.userId = u.id ORDER BY m.createdAt ASC LIMIT 1) AS workspace_id
     FROM "user" u
     WHERE (u.digest_daily = 1 OR u.digest_weekly = 1) AND u.email IS NOT NULL`
  ).all<DigestRow>();

  for (const row of results) {
    if (!row.workspace_id) continue;

    const local = new Date(nowMs - row.digest_tz_offset * 60_000);
    if (local.getUTCHours() !== row.digest_hour) continue;

    const localDate = local.toISOString().slice(0, 10);
    const user: DigestUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      workspaceId: row.workspace_id,
      timezoneOffsetMinutes: row.digest_tz_offset,
    };

    const due: DigestKind[] = [];
    if (row.digest_daily && row.digest_daily_sent !== localDate) due.push("daily");
    if (
      row.digest_weekly &&
      local.getUTCDay() === WEEKLY_SEND_WEEKDAY &&
      row.digest_weekly_sent !== localDate
    ) {
      due.push("weekly");
    }

    for (const kind of due) {
      try {
        // Daily covers yesterday; weekly covers the seven days ending yesterday.
        await sendDigest(env, user, kind, shiftLocalDate(localDate, -1));
        await env.DB.prepare(
          `UPDATE "user" SET ${kind === "daily" ? "digest_daily_sent" : "digest_weekly_sent"} = ? WHERE id = ?`
        )
          .bind(localDate, row.id)
          .run();
      } catch (e) {
        // One undeliverable address must not abort the sweep — but a persistent
        // failure means that person silently stops hearing from us.
        console.error("digest: send failed", {
          userId: row.id,
          kind,
          error: String(e),
        });
      }
    }
  }
}
