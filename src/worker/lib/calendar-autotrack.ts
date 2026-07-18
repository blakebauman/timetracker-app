// Shared logic for turning Google Calendar events into tracked time entries —
// used both by the user-triggered "Convert all" endpoint and the Cron-driven
// auto-track scheduler. Read-through of Google's API mirrors routes/calendar.ts.

import { encryptJSON, decryptJSON } from "./crypto";
import {
  ensureAccessToken,
  listEvents,
  type GoogleCalendarTokens,
  type ExternalEvent,
} from "./google-calendar";
import { broadcast } from "../db/queries";
import { inferEventProjects, type InferredEventProject } from "./ai";

interface GoogleConnection {
  id: string;
  workspaceId: string;
  autoTrack: boolean;
  tokens: GoogleCalendarTokens;
}

/** Load a workspace's decrypted Google Calendar connection, or null. */
export async function loadGoogleConnection(
  db: D1Database,
  secret: string,
  workspaceId: string
): Promise<GoogleConnection | null> {
  const row = await db
    .prepare(
      `SELECT id, auto_track, credentials FROM integrations
       WHERE workspace_id = ? AND type = 'google_calendar' LIMIT 1`
    )
    .bind(workspaceId)
    .first<{ id: string; auto_track: number; credentials: string }>();
  if (!row) return null;
  return {
    id: row.id,
    workspaceId,
    autoTrack: Boolean(row.auto_track),
    tokens: await decryptJSON<GoogleCalendarTokens>(secret, row.credentials),
  };
}

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
  } catch {
    // AI unavailable — entries still materialize, just uncategorized.
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
 */
export async function convertRange(
  env: Env,
  workspaceId: string,
  since: string,
  until: string,
  opts: { onlyEnded?: boolean } = {}
): Promise<number> {
  if (!env.GOOGLE_CALENDAR_CLIENT_ID || !env.GOOGLE_CALENDAR_CLIENT_SECRET) return 0;
  const conn = await loadGoogleConnection(env.DB, env.AUTH_SECRET, workspaceId);
  if (!conn) return 0;

  const { accessToken, refreshed } = await ensureAccessToken(
    conn.tokens,
    env.GOOGLE_CALENDAR_CLIENT_ID,
    env.GOOGLE_CALENDAR_CLIENT_SECRET
  );
  if (refreshed) {
    const credentials = await encryptJSON(env.AUTH_SECRET, conn.tokens);
    await env.DB.prepare(`UPDATE integrations SET credentials = ? WHERE id = ?`)
      .bind(credentials, conn.id)
      .run();
  }

  let events = await listEvents({ accessToken, since, until });
  if (opts.onlyEnded) {
    const nowMs = Date.now();
    events = events.filter((e) => new Date(e.stop).getTime() <= nowMs);
  }

  const created = await insertEvents(env, workspaceId, since, until, events);
  if (created > 0) await broadcast(env, workspaceId, "entries:changed", { source: "calendar" });
  return created;
}

/**
 * Cron entry point: for every workspace with auto-track enabled, materialize
 * calendar events that finished in the last hour. Dedup keeps it idempotent, so
 * overlapping runs are safe.
 */
export async function runAutoTrack(env: Env): Promise<void> {
  if (!env.GOOGLE_CALENDAR_CLIENT_ID || !env.GOOGLE_CALENDAR_CLIENT_SECRET) return;

  const { results } = await env.DB.prepare(
    `SELECT workspace_id FROM integrations
     WHERE type = 'google_calendar' AND auto_track = 1`
  ).all<{ workspace_id: string }>();

  const now = Date.now();
  const since = new Date(now - 60 * 60 * 1000).toISOString();
  const until = new Date(now + 60 * 1000).toISOString();

  for (const row of results) {
    try {
      await convertRange(env, row.workspace_id, since, until, { onlyEnded: true });
    } catch {
      // One workspace failing (revoked token, transient Google error) must not
      // abort the rest of the sweep.
    }
  }
}
