// "Draft my day": turn the signals the app already holds into proposed time
// entries for a single local day, which the user confirms (or edits, or throws
// away) in review.
//
// The pipeline is deliberately three-staged, and the order matters:
//
//   1. Candidates are found DETERMINISTICALLY — a calendar event that ended
//      untracked, an uncovered stretch between the day's activity, work this
//      person logs on this weekday most weeks. When and how long are facts, and
//      facts do not come from a model.
//   2. One AI call enriches those candidates with a plain-language description
//      and a project, grounded to the workspace's real projects.
//   3. Everything the model returned is validated before it is stored, and any
//      failure falls back to the deterministic seed from step 1.
//
// So the worst an unavailable or hallucinating model can do is leave the day
// drafted in flatter language. It can never invent an entry, move one, or
// change a duration.

import type { DraftEntry } from "@shared/schemas";
import { loadTodayEvents } from "./assistant";
import {
  loadGroundingProjects,
  runDayDraftEnrichment,
  type DraftEnrichmentCandidate,
} from "./ai";

/** Ignore uncovered stretches shorter than this — a coffee is not lost time. */
const MIN_GAP_MS = 30 * 60_000;
/** And longer than this it's lunch, an errand, or the end of the day. */
const MAX_GAP_MS = 3 * 60 * 60_000;
/** Caps per source, so a messy day proposes a reviewable list, not a wall. */
const MAX_GAP_DRAFTS = 4;
const MAX_PATTERN_DRAFTS = 2;
const MAX_DRAFTS_PER_DAY = 12;
/** How far back the weekday-pattern detector looks. */
const PATTERN_LOOKBACK_WEEKS = 8;
/** …and how many of those weeks must contain the work before it's a pattern. */
const PATTERN_MIN_OCCURRENCES = 3;

export type DraftSource = "calendar" | "gap" | "pattern";

interface Candidate {
  start: string;
  stop: string;
  durationSeconds: number;
  source: DraftSource;
  calendarEventId: string | null;
  /** Deterministic seed — survives an absent or rejected AI response. */
  description: string;
  projectId: string | null;
  taskId: string | null;
  billable: boolean | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  /** What the model is told about this slot. */
  signal: string;
}

interface Interval {
  start: number;
  stop: number;
}

interface DayEntry {
  id: string;
  description: string;
  start: string;
  stop: string | null;
  duration: number | null;
  projectId: string | null;
  projectName: string | null;
  calendarEventId: string | null;
}

// ─── Interval helpers ────────────────────────────────────────────────────────

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.stop) last.stop = Math.max(last.stop, iv.stop);
    else merged.push({ ...iv });
  }
  return merged;
}

/** Uncovered stretches inside [windowStart, windowEnd] between busy intervals. */
export function findGaps(
  busy: Interval[],
  windowStart: number,
  windowEnd: number,
  minMs = MIN_GAP_MS,
  maxMs = MAX_GAP_MS
): Interval[] {
  const merged = mergeIntervals(busy);
  const gaps: Interval[] = [];
  let cursor = windowStart;
  for (const iv of merged) {
    if (iv.start > cursor) {
      const stop = Math.min(iv.start, windowEnd);
      const len = stop - cursor;
      if (len >= minMs && len <= maxMs) gaps.push({ start: cursor, stop });
    }
    cursor = Math.max(cursor, iv.stop);
    if (cursor >= windowEnd) break;
  }
  return gaps;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function localClock(iso: string | number, offsetMinutes: number): string {
  const ms = typeof iso === "number" ? iso : new Date(iso).getTime();
  const local = new Date(ms - offsetMinutes * 60_000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

function humanDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

// ─── Candidate discovery ─────────────────────────────────────────────────────

/**
 * Work this person logs on this weekday in most recent weeks but hasn't logged
 * on this date. Purely historical: no model, no guessing at content — the
 * description is one they have written themselves, repeatedly.
 */
async function findPatternCandidates(
  db: D1Database,
  workspaceId: string,
  dayStartMs: number,
  offsetMinutes: number,
  alreadyDescribed: Set<string>
): Promise<Omit<Candidate, "signal">[]> {
  const localWeekday = new Date(dayStartMs - offsetMinutes * 60_000).getUTCDay();
  const since = new Date(dayStartMs - PATTERN_LOOKBACK_WEEKS * 7 * 86_400_000).toISOString();

  const { results } = await db
    .prepare(
      `SELECT description, start, duration, project_id, task_id, billable
       FROM time_entries
       WHERE workspace_id = ? AND stop IS NOT NULL AND start >= ? AND start < ?
         AND TRIM(description) <> ''
       ORDER BY start DESC LIMIT 1000`
    )
    .bind(workspaceId, since, new Date(dayStartMs).toISOString())
    .all<Record<string, unknown>>();

  interface Bucket {
    description: string;
    days: Set<string>;
    totalDuration: number;
    startMinutes: number[];
    projectId: string | null;
    taskId: string | null;
    billable: boolean;
  }
  const buckets = new Map<string, Bucket>();

  for (const row of results) {
    const startMs = new Date(row.start as string).getTime();
    const local = new Date(startMs - offsetMinutes * 60_000);
    if (local.getUTCDay() !== localWeekday) continue;

    const description = (row.description as string).trim();
    const key = description.toLowerCase();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        description,
        days: new Set(),
        totalDuration: 0,
        startMinutes: [],
        projectId: (row.project_id as string | null) ?? null,
        taskId: (row.task_id as string | null) ?? null,
        billable: Boolean(row.billable),
      };
      buckets.set(key, bucket);
    }
    bucket.days.add(local.toISOString().slice(0, 10));
    bucket.totalDuration += (row.duration as number) ?? 0;
    bucket.startMinutes.push(local.getUTCHours() * 60 + local.getUTCMinutes());
  }

  const out: Omit<Candidate, "signal">[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.days.size < PATTERN_MIN_OCCURRENCES) continue;
    if (alreadyDescribed.has(bucket.description.toLowerCase())) continue;

    const occurrences = bucket.days.size;
    const avgSeconds = Math.round(bucket.totalDuration / bucket.startMinutes.length);
    if (avgSeconds < 300) continue; // sub-5-minute habits aren't worth proposing

    // Median start, not mean: one 06:00 outlier shouldn't drag a 09:00 habit.
    const sorted = [...bucket.startMinutes].sort((a, b) => a - b);
    const medianStartMinutes = sorted[Math.floor(sorted.length / 2)];

    const startMs = dayStartMs + medianStartMinutes * 60_000;
    out.push({
      start: new Date(startMs).toISOString(),
      stop: new Date(startMs + avgSeconds * 1000).toISOString(),
      durationSeconds: avgSeconds,
      source: "pattern",
      calendarEventId: null,
      description: bucket.description,
      projectId: bucket.projectId,
      taskId: bucket.taskId,
      billable: bucket.billable,
      confidence: occurrences >= 6 ? "high" : "medium",
      reason: `You logged this on ${occurrences} of the last ${PATTERN_LOOKBACK_WEEKS} ${weekdayName(localWeekday)}s`,
    });
  }

  return out
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, MAX_PATTERN_DRAFTS);
}

function weekdayName(weekday: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    weekday
  ];
}

// ─── Generation ──────────────────────────────────────────────────────────────

export interface GenerateResult {
  drafts: DraftEntry[];
  created: number;
  /** False when the AI step was skipped or rejected — the UI says so. */
  enriched: boolean;
}

/**
 * Propose the day's missing entries and persist them.
 *
 * Idempotent by construction: candidates that already exist as a confirmed
 * entry or an outstanding draft are never re-proposed, and the table's unique
 * indexes reject a duplicate slot even under a concurrent second call. Running
 * this repeatedly through a day is the intended usage — it fills in what has
 * happened since the last run.
 */
export async function generateDrafts(
  env: Env,
  workspaceId: string,
  userId: string,
  localDate: string,
  offsetMinutes: number,
  nowMs: number = Date.now()
): Promise<GenerateResult> {
  const dayStartMs =
    new Date(`${localDate}T00:00:00Z`).getTime() + offsetMinutes * 60_000;
  const dayEndMs = dayStartMs + 86_400_000;
  const dayStartIso = new Date(dayStartMs).toISOString();
  const dayEndIso = new Date(dayEndMs).toISOString();

  // Nothing that hasn't happened yet can be drafted.
  const windowEnd = Math.min(dayEndMs, nowMs);
  if (windowEnd <= dayStartMs) {
    return { drafts: await listDrafts(env.DB, workspaceId, userId, localDate), created: 0, enriched: false };
  }

  const [entriesRes, existingDraftsRes, events, projects] = await Promise.all([
    env.DB.prepare(
      `SELECT te.id, te.description, te.start, te.stop, te.duration, te.project_id,
              te.calendar_event_id, p.name AS project_name
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id AND p.workspace_id = te.workspace_id
       WHERE te.workspace_id = ? AND te.start < ? AND (te.stop IS NULL OR te.stop > ?)
       ORDER BY te.start ASC`
    )
      .bind(workspaceId, dayEndIso, dayStartIso)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT start, stop, calendar_event_id FROM draft_entries
       WHERE workspace_id = ? AND user_id = ? AND local_date = ?`
    )
      .bind(workspaceId, userId, localDate)
      .all<{ start: string; stop: string; calendar_event_id: string | null }>(),
    loadTodayEvents(env, workspaceId, dayStartIso, dayEndIso),
    loadGroundingProjects(env.DB, workspaceId),
  ]);

  const entries: DayEntry[] = entriesRes.results.map((r) => ({
    id: r.id as string,
    description: (r.description as string) ?? "",
    start: r.start as string,
    stop: (r.stop as string | null) ?? null,
    duration: (r.duration as number | null) ?? null,
    projectId: (r.project_id as string | null) ?? null,
    projectName: (r.project_name as string | null) ?? null,
    calendarEventId: (r.calendar_event_id as string | null) ?? null,
  }));

  const trackedEventIds = new Set(
    entries.map((e) => e.calendarEventId).filter((id): id is string => Boolean(id))
  );
  const draftedEventIds = new Set(
    existingDraftsRes.results
      .map((d) => d.calendar_event_id)
      .filter((id): id is string => Boolean(id))
  );

  const candidates: Omit<Candidate, "signal">[] = [];

  // 1. Calendar events that have ended and aren't on the timesheet.
  const calendarCandidates = events
    .filter((e) => new Date(e.stop).getTime() <= windowEnd)
    .filter((e) => !trackedEventIds.has(e.calendarEventId))
    .filter((e) => !draftedEventIds.has(e.calendarEventId));

  for (const e of calendarCandidates) {
    const startMs = new Date(e.start).getTime();
    const stopMs = new Date(e.stop).getTime();
    candidates.push({
      start: e.start,
      stop: e.stop,
      durationSeconds: Math.round((stopMs - startMs) / 1000),
      source: "calendar",
      calendarEventId: e.calendarEventId,
      description: e.title,
      projectId: null,
      taskId: null,
      billable: null,
      confidence: "high",
      reason: "Calendar event that ended without being tracked",
    });
  }

  // 2. Uncovered stretches. "Busy" is everything already accounted for: tracked
  //    entries, every calendar event (tracked or not), outstanding drafts, and
  //    the calendar candidates just proposed — otherwise a meeting would be
  //    proposed twice, once as itself and once as the hole it left.
  const busy: Interval[] = [
    ...entries.map((e) => ({
      start: new Date(e.start).getTime(),
      stop: e.stop ? new Date(e.stop).getTime() : nowMs,
    })),
    ...events.map((e) => ({
      start: new Date(e.start).getTime(),
      stop: new Date(e.stop).getTime(),
    })),
    ...existingDraftsRes.results.map((d) => ({
      start: new Date(d.start).getTime(),
      stop: new Date(d.stop).getTime(),
    })),
  ];

  if (busy.length) {
    // Only inside the day's own working window: the hours before the first
    // thing you did aren't a gap, they're the morning.
    const windowStart = Math.min(...busy.map((b) => b.start));
    const gaps = findGaps(busy, windowStart, windowEnd).slice(0, MAX_GAP_DRAFTS);
    for (const gap of gaps) {
      const before = entries
        .filter((e) => e.stop && new Date(e.stop).getTime() <= gap.start)
        .pop();
      candidates.push({
        start: new Date(gap.start).toISOString(),
        stop: new Date(gap.stop).toISOString(),
        durationSeconds: Math.round((gap.stop - gap.start) / 1000),
        source: "gap",
        calendarEventId: null,
        // The seed is deliberately empty rather than a guess — if the AI step
        // doesn't run, this arrives in review as a blank slot to fill, which is
        // honest, instead of a description nothing supports.
        description: "",
        projectId: before?.projectId ?? null,
        taskId: null,
        billable: null,
        confidence: "low",
        reason: `${humanDuration(Math.round((gap.stop - gap.start) / 1000))} between ${localClock(gap.start, offsetMinutes)} and ${localClock(gap.stop, offsetMinutes)} isn't accounted for`,
      });
    }
  }

  // 3. Weekday habits not yet logged today.
  const alreadyDescribed = new Set(
    entries.map((e) => e.description.trim().toLowerCase()).filter(Boolean)
  );
  const patternCandidates = await findPatternCandidates(
    env.DB,
    workspaceId,
    dayStartMs,
    offsetMinutes,
    alreadyDescribed
  );
  const occupied = mergeIntervals(busy);
  for (const p of patternCandidates) {
    const startMs = new Date(p.start).getTime();
    const stopMs = new Date(p.stop).getTime();
    if (stopMs > windowEnd) continue; // its usual slot hasn't passed yet today
    // Don't drop a habit on top of something already there.
    if (occupied.some((iv) => startMs < iv.stop && stopMs > iv.start)) continue;
    candidates.push(p);
  }

  if (!candidates.length) {
    return {
      drafts: await listDrafts(env.DB, workspaceId, userId, localDate),
      created: 0,
      enriched: false,
    };
  }

  const capped = candidates
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, MAX_DRAFTS_PER_DAY);

  // ── AI enrichment (best-effort) ───────────────────────────────────────────
  const enrichmentInput: DraftEnrichmentCandidate[] = capped.map((c, index) => ({
    index,
    when: `${localClock(c.start, offsetMinutes)}–${localClock(c.stop, offsetMinutes)} (${humanDuration(c.durationSeconds)})`,
    signal:
      c.source === "calendar"
        ? `Calendar event titled "${c.description}"`
        : c.source === "pattern"
          ? `Recurring weekday work the user usually logs as "${c.description}"${c.projectId ? "" : " (no project)"}`
          : "Untracked time with no calendar event and no entry",
  }));

  const enrichment = await runDayDraftEnrichment(
    env.AI,
    buildDayContext(entries, capped, offsetMinutes),
    enrichmentInput,
    projects
  );

  // ── Persist ───────────────────────────────────────────────────────────────
  const projectBillable = new Map(projects.map((p) => [p.id, p.billable]));
  const now = new Date().toISOString();
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO draft_entries
       (id, workspace_id, user_id, local_date, project_id, task_id, description,
        start, stop, duration, billable, source, confidence, reason,
        calendar_event_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const rows = capped.map((c, index) => {
    const ai = enrichment.get(index);
    const projectId = ai?.projectId ?? c.projectId;
    // Billing follows the same precedence as everywhere else in the app: an
    // explicit signal wins, otherwise inherit the project's default.
    const billable =
      ai?.billable ?? c.billable ?? (projectId ? (projectBillable.get(projectId) ?? false) : false);
    return stmt.bind(
      crypto.randomUUID(),
      workspaceId,
      userId,
      localDate,
      projectId,
      c.taskId,
      (ai?.description || c.description).slice(0, 2000),
      c.start,
      c.stop,
      c.durationSeconds,
      billable ? 1 : 0,
      c.source,
      c.confidence,
      c.reason,
      c.calendarEventId,
      now,
      now
    );
  });

  await env.DB.batch(rows);

  return {
    drafts: await listDrafts(env.DB, workspaceId, userId, localDate),
    created: capped.length,
    enriched: enrichment.size > 0,
  };
}

/** The already-known shape of the day, as prose the model can quote from. */
function buildDayContext(
  entries: DayEntry[],
  candidates: Omit<Candidate, "signal">[],
  offsetMinutes: number
): string {
  const tracked = entries.length
    ? entries
        .map(
          (e) =>
            `- ${localClock(e.start, offsetMinutes)}–${e.stop ? localClock(e.stop, offsetMinutes) : "running"} | ${e.projectName ?? "No project"} | ${e.description || "(no description)"}`
        )
        .join("\n")
    : "(nothing tracked yet)";
  return `Already on the timesheet for this day:
${tracked}

There are ${candidates.length} unaccounted slots to describe.`;
}

// ─── Reads and writes ────────────────────────────────────────────────────────

function formatDraft(row: Record<string, unknown>): DraftEntry {
  return {
    id: row.id as string,
    localDate: row.local_date as string,
    projectId: (row.project_id as string | null) ?? null,
    projectName: (row.project_name as string | null) ?? null,
    projectColor: (row.project_color as string | null) ?? null,
    taskId: (row.task_id as string | null) ?? null,
    taskName: (row.task_name as string | null) ?? null,
    description: (row.description as string) ?? "",
    start: row.start as string,
    stop: row.stop as string,
    duration: (row.duration as number) ?? 0,
    billable: Boolean(row.billable),
    source: row.source as DraftSource,
    confidence: (row.confidence as "high" | "medium" | "low") ?? "medium",
    reason: (row.reason as string | null) ?? null,
    calendarEventId: (row.calendar_event_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

const DRAFT_SELECT = `
  SELECT d.*, p.name AS project_name, p.color AS project_color, tk.name AS task_name
  FROM draft_entries d
  LEFT JOIN projects p ON p.id = d.project_id AND p.workspace_id = d.workspace_id
  LEFT JOIN tasks   tk ON tk.id = d.task_id   AND tk.workspace_id = d.workspace_id
`;

export async function listDrafts(
  db: D1Database,
  workspaceId: string,
  userId: string,
  localDate: string
): Promise<DraftEntry[]> {
  return listDraftRange(db, workspaceId, userId, localDate, localDate);
}

/** Drafts across an inclusive range of local dates — what the calendar paints. */
export async function listDraftRange(
  db: D1Database,
  workspaceId: string,
  userId: string,
  since: string,
  until: string
): Promise<DraftEntry[]> {
  const { results } = await db
    .prepare(
      `${DRAFT_SELECT}
       WHERE d.workspace_id = ? AND d.user_id = ?
         AND d.local_date >= ? AND d.local_date <= ?
       ORDER BY d.start ASC`
    )
    .bind(workspaceId, userId, since, until)
    .all<Record<string, unknown>>();
  return results.map(formatDraft);
}

export async function getDraft(
  db: D1Database,
  workspaceId: string,
  userId: string,
  id: string
): Promise<DraftEntry | null> {
  const row = await db
    .prepare(`${DRAFT_SELECT} WHERE d.id = ? AND d.workspace_id = ? AND d.user_id = ?`)
    .bind(id, workspaceId, userId)
    .first<Record<string, unknown>>();
  return row ? formatDraft(row) : null;
}

/**
 * Spread a reported total across drafts by scaling each one proportionally.
 *
 * This is the last step of review: the entries are individually plausible but
 * the day's total is what the user actually stands behind, so they set that
 * number and every draft moves with it rather than being hand-edited one by
 * one. Returns new durations in seconds, in the same order, each at least a
 * minute so nothing is scaled into nonexistence.
 */
export function scaleDurations(durations: number[], targetTotal: number): number[] {
  const current = durations.reduce((sum, d) => sum + d, 0);
  if (current <= 0 || targetTotal <= 0 || !durations.length) return durations;

  const ratio = targetTotal / current;
  const scaled = durations.map((d) => Math.max(60, Math.round(d * ratio)));

  // Rounding leaves the sum a few seconds off the target; put the remainder on
  // the largest entry, where it's proportionally least visible.
  const drift = targetTotal - scaled.reduce((sum, d) => sum + d, 0);
  if (drift !== 0) {
    let largest = 0;
    for (let i = 1; i < scaled.length; i++) if (scaled[i] > scaled[largest]) largest = i;
    scaled[largest] = Math.max(60, scaled[largest] + drift);
  }
  return scaled;
}
