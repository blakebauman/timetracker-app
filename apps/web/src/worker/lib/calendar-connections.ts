// Loading, refreshing and reading from a workspace's calendar connections,
// whichever providers they are.
//
// Everything above this line in the stack — ghost blocks, auto-track, the
// assistant's nudges, day drafting — wants one thing: "the events this person
// has in this range". None of them should know or care that some come from
// Google and some from Microsoft.

import { encryptJSON, decryptJSON } from "./crypto";
import {
  CALENDAR_PROVIDERS,
  PROVIDER_IDS,
  providerCredentials,
  type CalendarProvider,
  type CalendarProviderId,
  type CalendarTokens,
  type ExternalEvent,
} from "./calendar-providers";

export interface CalendarConnection {
  id: string;
  workspaceId: string;
  provider: CalendarProvider;
  tokens: CalendarTokens;
  autoTrack: boolean;
  /** The ciphertext these tokens were decrypted from — the compare half of the compare-and-set persist. */
  credentials: string;
}

/** Every configured, connected calendar for a workspace. */
export async function loadCalendarConnections(
  env: Env,
  workspaceId: string
): Promise<CalendarConnection[]> {
  const types = PROVIDER_IDS.filter((id) => providerCredentials(env, id)).map(
    (id) => CALENDAR_PROVIDERS[id]
  );
  if (!types.length) return [];

  const placeholders = types.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, type, credentials, auto_track FROM integrations
     WHERE workspace_id = ? AND type IN (${placeholders})`
  )
    .bind(workspaceId, ...types.map((p) => p.integrationType))
    .all<{ id: string; type: string; credentials: string; auto_track: number }>();

  const out: CalendarConnection[] = [];
  for (const row of results) {
    const provider = types.find((p) => p.integrationType === row.type);
    if (!provider) continue;
    try {
      out.push({
        id: row.id,
        workspaceId,
        provider,
        tokens: await decryptJSON<CalendarTokens>(env.AUTH_SECRET, row.credentials),
        autoTrack: Boolean(row.auto_track),
        credentials: row.credentials,
      });
    } catch (e) {
      // A row that won't decrypt (AUTH_SECRET rotated, corrupted write) must not
      // take the other provider down with it.
      console.error("calendar: connection failed to decrypt", {
        workspaceId,
        type: row.type,
        error: String(e),
      });
    }
  }
  return out;
}

/** A usable access token, refreshing and persisting the rotation if needed. */
export async function accessTokenFor(
  env: Env,
  conn: CalendarConnection
): Promise<string> {
  const creds = providerCredentials(env, conn.provider.id);
  if (!creds) throw new Error(`${conn.provider.label} is not configured on this server`);

  const { accessToken, refreshed } = await conn.provider.ensureAccessToken(
    conn.tokens,
    creds.clientId,
    creds.clientSecret,
    env.MICROSOFT_CALENDAR_TENANT
  );
  if (refreshed) {
    // Microsoft rotates refresh tokens, so this persists more than an expiry
    // bump — skip it and the connection dies when the old token is retired.
    //
    // Compare-and-set against the ciphertext we loaded: the cron sweep and a
    // user request can both find the token expired and both refresh. With a
    // provider that rotates, the loser's refresh token is already dead, and a
    // blind UPDATE would store it over the winner's live one — killing the
    // connection with no error anywhere. If the row moved under us, take the
    // winner's tokens instead of persisting ours.
    const credentials = await encryptJSON(env.AUTH_SECRET, conn.tokens);
    try {
      const res = await env.DB.prepare(
        `UPDATE integrations SET credentials = ?
         WHERE id = ? AND workspace_id = ? AND credentials = ?`
      )
        .bind(credentials, conn.id, conn.workspaceId, conn.credentials)
        .run();
      if (res.meta.changes === 1) {
        conn.credentials = credentials;
      } else {
        const row = await env.DB.prepare(
          `SELECT credentials FROM integrations WHERE id = ? AND workspace_id = ?`
        )
          .bind(conn.id, conn.workspaceId)
          .first<{ credentials: string }>();
        if (row) {
          conn.credentials = row.credentials;
          conn.tokens = await decryptJSON<CalendarTokens>(env.AUTH_SECRET, row.credentials);
          console.warn("calendar: concurrent token refresh, adopted the persisted rotation", {
            workspaceId: conn.workspaceId,
            provider: conn.provider.id,
          });
          return conn.tokens.accessToken || accessToken;
        }
      }
    } catch (e) {
      // The IdP has already consumed the old refresh token; if this write is
      // lost the connection is dead on its next refresh. Say so loudly — this
      // used to surface only as a generic "provider read failed" warning.
      console.error("calendar: failed to persist rotated tokens — reconnect may be needed", {
        workspaceId: conn.workspaceId,
        provider: conn.provider.id,
        error: String(e),
      });
    }
  }
  return accessToken;
}

/**
 * How long one connection's read of one range is reused. Every surface asks for
 * "today" or "this week" — the nudge poll (every tab, plus the extension), each
 * Assistant turn, plan-day, drafting, the calendar grid — and each used to make
 * its own live Google/Graph call for the same answer. A meeting created in the
 * provider shows up at most this late.
 */
const EVENTS_CACHE_TTL_S = 90;

/**
 * Cache API key for one connection's read of one range. Keyed by connection id,
 * not just workspace: a reconnect is a new row (a new key), and a disconnected
 * connection is never loaded, so its entries are simply never read again. The
 * host is never routed — the key only has to be a URL.
 */
function eventsCacheKey(conn: CalendarConnection, since: string, until: string): Request {
  const q = new URLSearchParams({ since, until });
  return new Request(
    `https://calendar-cache.timetracker.internal/${encodeURIComponent(conn.workspaceId)}/${conn.id}?${q}`
  );
}

/** The per-colo cache, where the runtime has one (not in every test harness). */
function eventsCache(): Cache | null {
  return typeof caches === "undefined" ? null : caches.default;
}

async function readCachedEvents(key: Request): Promise<ExternalEvent[] | null> {
  try {
    const hit = await eventsCache()?.match(key);
    return hit ? ((await hit.json()) as ExternalEvent[]) : null;
  } catch {
    return null;
  }
}

async function writeCachedEvents(key: Request, events: ExternalEvent[]): Promise<void> {
  try {
    await eventsCache()?.put(
      key,
      new Response(JSON.stringify(events), {
        headers: {
          "content-type": "application/json",
          "cache-control": `max-age=${EVENTS_CACHE_TTL_S}`,
        },
      })
    );
  } catch {
    // A cache that won't take the write costs the next caller a live read, nothing more.
  }
}

/**
 * Events across every connected calendar in [since, until].
 *
 * One provider failing (revoked token, Graph outage) yields that provider's
 * events as empty rather than failing the whole read — a broken work calendar
 * shouldn't blank out a working personal one.
 *
 * `onlyAutoTrack` restricts to connections the user opted into auto-tracking,
 * which is what the cron sweep wants.
 *
 * Successful reads are cached per connection and range for EVENTS_CACHE_TTL_S
 * (a failed read is not, so the next caller retries the provider). `fresh`
 * skips the cache read — for the auto-track sweep, which turns events into
 * entries and must see the provider as it is now.
 */
export async function fetchWorkspaceEvents(
  env: Env,
  workspaceId: string,
  since: string,
  until: string,
  opts: { onlyAutoTrack?: boolean; fresh?: boolean } = {}
): Promise<ExternalEvent[]> {
  const connections = (await loadCalendarConnections(env, workspaceId)).filter(
    (c) => !opts.onlyAutoTrack || c.autoTrack
  );
  if (!connections.length) return [];

  const perProvider = await Promise.all(
    connections.map(async (conn) => {
      const key = eventsCacheKey(conn, since, until);
      if (!opts.fresh) {
        const cached = await readCachedEvents(key);
        if (cached) return cached;
      }
      try {
        const accessToken = await accessTokenFor(env, conn);
        const events = await conn.provider.listEvents({ accessToken, since, until });
        await writeCachedEvents(key, events);
        return events;
      } catch (e) {
        console.warn("calendar: provider read failed", {
          workspaceId,
          provider: conn.provider.id,
          error: String(e),
        });
        return [] as ExternalEvent[];
      }
    })
  );

  // Two calendars can hold the same meeting (a Google invite mirrored into
  // Outlook). Ids differ across providers so this can't dedupe them properly;
  // dropping exact id collisions is all that's safe here, and the review step
  // is where a genuine duplicate gets thrown away by a person.
  const seen = new Set<string>();
  const merged: ExternalEvent[] = [];
  for (const event of perProvider.flat()) {
    if (seen.has(event.calendarEventId)) continue;
    seen.add(event.calendarEventId);
    merged.push(event);
  }
  return merged.sort((a, b) => a.start.localeCompare(b.start));
}

/** Workspaces with at least one auto-track calendar, for the cron sweep. */
export async function workspacesWithAutoTrack(env: Env): Promise<string[]> {
  const configured = PROVIDER_IDS.filter((id) => providerCredentials(env, id));
  if (!configured.length) return [];
  const placeholders = configured.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT workspace_id FROM integrations
     WHERE auto_track = 1 AND type IN (${placeholders})`
  )
    .bind(...configured.map((id) => CALENDAR_PROVIDERS[id].integrationType))
    .all<{ workspace_id: string }>();
  return results.map((r) => r.workspace_id);
}

export type { CalendarProviderId, CalendarTokens, ExternalEvent };
