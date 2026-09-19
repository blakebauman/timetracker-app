// Turning calendar events into tracked time entries — used both by the
// user-triggered "Convert all" endpoint and the cron-driven auto-track
// scheduler. Provider-agnostic: it asks lib/calendar-connections.ts for the
// workspace's events and never knows which calendar they came from.

import { broadcast } from "../db/queries";
import { inferEventProjects, type InferredEventProject } from "./ai";
import {
  fetchWorkspaceEvents,
  workspacesWithAutoTrack,
} from "./calendar-connections";
import type { ExternalEvent } from "./calendar-providers";

/** Insert entries for events not already confirmed in [since, until]. Returns count. */
async function insertEvents(
  env: Env,
  workspaceId: string,
  since: string,
  until: string,
  events: ExternalEvent[]
): Promise<number> {
  const db = env.DB;
  if (!events.length) return 0;

  const { results } = await db
    .prepare(
      `SELECT calendar_event_id FROM time_entries
       WHERE workspace_id = ? AND calendar_event_id IS NOT NULL
         AND start >= ? AND start <= ?`
    )
    .bind(workspaceId, since, until)
    .all<{ calendar_event_id: string }>();
  const confirmed = new Set(results.map((r) => r.calendar_event_id));

  const fresh = events.filter((e) => !confirmed.has(e.calendarEventId));
  if (!fresh.length) return 0;

  // Best-effort project match from the event title, so meetings land on the
  // right engagement with its billable default. Unmatched → no project, 0.
  let inferred = new Map<string, InferredEventProject>();
  try {
    inferred = await inferEventProjects(db, env.AI, workspaceId, fresh.map((e) => e.title));
  } catch (e) {
    // AI unavailable — entries still materialize, just uncategorized.
    console.warn("autotrack: project inference unavailable", { workspaceId, error: String(e) });
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO time_entries
       (id, workspace_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, CAST((julianday(?) - julianday(?)) * 86400 + 0.5 AS INTEGER), ?, ?, ?, ?)`
  );
  await db.batch(
    fresh.map((e) => {
      const match = inferred.get(e.title.trim());
      return stmt.bind(
        crypto.randomUUID(),
        workspaceId,
        match?.projectId ?? null,
        e.title,
        e.start,
        e.stop,
        e.stop,
        e.start,
        match ? (match.billable ? 1 : 0) : 0,
        e.calendarEventId,
        now,
        now
      );
    })
  );
  return fresh.length;
}

/**
 * Materialize calendar events in [since, until] into time entries for one
 * workspace. `onlyEnded` restricts to events that have already finished (used by
 * the scheduler so we don't create entries with a stop time in the future).
 * `onlyAutoTrack` restricts to calendars the user opted into auto-tracking —
 * the cron's business, not the "Convert all" button's.
 */
export async function convertRange(
  env: Env,
  workspaceId: string,
  since: string,
  until: string,
  opts: { onlyEnded?: boolean; onlyAutoTrack?: boolean } = {}
): Promise<number> {
  let events = await fetchWorkspaceEvents(env, workspaceId, since, until, {
    onlyAutoTrack: opts.onlyAutoTrack,
  });
  if (opts.onlyEnded) {
    const nowMs = Date.now();
    events = events.filter((e) => new Date(e.stop).getTime() <= nowMs);
  }

  const created = await insertEvents(env, workspaceId, since, until, events);
  if (created > 0) await broadcast(env, workspaceId, "entries:changed", { source: "calendar" });
  return created;
}

/**
 * Cron entry point: for every workspace with an auto-track calendar, materialize
 * events that finished in the last hour. Dedup keeps it idempotent, so
 * overlapping runs are safe.
 */
export async function runAutoTrack(env: Env): Promise<void> {
  const workspaceIds = await workspacesWithAutoTrack(env);
  if (!workspaceIds.length) return;

  const now = Date.now();
  const since = new Date(now - 60 * 60 * 1000).toISOString();
  const until = new Date(now + 60 * 1000).toISOString();

  // Bounded concurrency: a serial sweep head-of-line-blocks every workspace
  // behind one slow provider response; unbounded Promise.all would breach the
  // 6-simultaneous-connection limit. Chunks of 5 keep the sweep O(n/5).
  const CONCURRENCY = 5;
  for (let i = 0; i < workspaceIds.length; i += CONCURRENCY) {
    await Promise.all(
      workspaceIds.slice(i, i + CONCURRENCY).map(async (workspaceId) => {
        try {
          await convertRange(env, workspaceId, since, until, {
            onlyEnded: true,
            onlyAutoTrack: true,
          });
        } catch (e) {
          // One workspace failing (revoked token, transient provider error) must
          // not abort the rest of the sweep — but a persistent failure means
          // that workspace's entries silently stop materializing, so log it.
          console.error("autotrack: workspace sweep failed", {
            workspaceId,
            error: String(e),
          });
        }
      })
    );
  }
}
