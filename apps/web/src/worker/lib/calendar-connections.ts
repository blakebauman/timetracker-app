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
  provider: CalendarProvider;
  tokens: CalendarTokens;
  autoTrack: boolean;
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
        provider,
        tokens: await decryptJSON<CalendarTokens>(env.AUTH_SECRET, row.credentials),
        autoTrack: Boolean(row.auto_track),
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
    const credentials = await encryptJSON(env.AUTH_SECRET, conn.tokens);
    await env.DB.prepare(`UPDATE integrations SET credentials = ? WHERE id = ?`)
      .bind(credentials, conn.id)
      .run();
  }
  return accessToken;
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
 */
export async function fetchWorkspaceEvents(
  env: Env,
  workspaceId: string,
  since: string,
  until: string,
  opts: { onlyAutoTrack?: boolean } = {}
): Promise<ExternalEvent[]> {
  const connections = (await loadCalendarConnections(env, workspaceId)).filter(
    (c) => !opts.onlyAutoTrack || c.autoTrack
  );
  if (!connections.length) return [];

  const perProvider = await Promise.all(
    connections.map(async (conn) => {
      try {
        const accessToken = await accessTokenFor(env, conn);
        return await conn.provider.listEvents({ accessToken, since, until });
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
