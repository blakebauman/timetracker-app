import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { encryptJSON, decryptJSON } from "../lib/crypto";
import {
  buildConsentUrl,
  exchangeCode,
  ensureAccessToken,
  listEvents,
  type GoogleCalendarTokens,
} from "../lib/google-calendar";
import { convertRange } from "../lib/calendar-autotrack";

const STATE_COOKIE = "tt_gcal_state";

function redirectUri(reqUrl: string): string {
  return `${new URL(reqUrl).origin}/api/calendar/google/callback`;
}

function isConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET);
}

async function loadConnection(
  db: D1Database,
  secret: string,
  workspaceId: string,
): Promise<{ id: string; tokens: GoogleCalendarTokens } | null> {
  const row = await db
    .prepare(
      `SELECT id, credentials FROM integrations
       WHERE workspace_id = ? AND type = 'google_calendar' LIMIT 1`,
    )
    .bind(workspaceId)
    .first<{ id: string; credentials: string }>();
  if (!row) return null;
  return { id: row.id, tokens: await decryptJSON<GoogleCalendarTokens>(secret, row.credentials) };
}

export const calendarRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  // ── Begin OAuth: redirect the browser to Google's consent screen ──────────
  .get("/google/connect", (c) => {
    if (!isConfigured(c.env)) {
      return c.redirect("/settings?calendar=not_configured");
    }
    const state = crypto.randomUUID();
    // Bind the initiating workspace into the httpOnly state cookie so the callback
    // can't land the connection in a different workspace if the user switches
    // their active workspace mid-flow (the OAuth `state` param stays the raw token).
    setCookie(c, STATE_COOKIE, `${state}.${c.get("workspaceId")}`, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    });
    return c.redirect(
      buildConsentUrl({
        clientId: c.env.GOOGLE_CALENDAR_CLIENT_ID!,
        redirectUri: redirectUri(c.req.url),
        state,
      }),
    );
  })
  // ── OAuth callback: exchange the code and store encrypted tokens ──────────
  .get("/google/callback", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { code, state, error } = c.req.query();
    const expected = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });

    // Cookie is "<state>.<initiating workspace>". Verify the state token matches
    // AND the flow completes in the same workspace it began in.
    const dot = (expected ?? "").indexOf(".");
    const expectedState = dot >= 0 ? expected!.slice(0, dot) : "";
    const expectedWorkspace = dot >= 0 ? expected!.slice(dot + 1) : "";
    if (error || !code || !state || state !== expectedState || expectedWorkspace !== workspaceId) {
      return c.redirect("/settings?calendar=error");
    }

    try {
      const tokens = await exchangeCode({
        clientId: c.env.GOOGLE_CALENDAR_CLIENT_ID!,
        clientSecret: c.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
        code,
        redirectUri: redirectUri(c.req.url),
      });
      const credentials = await encryptJSON(c.env.AUTH_SECRET, tokens);
      // One connection per workspace: replace any existing one.
      await c.env.DB.prepare(
        `DELETE FROM integrations WHERE workspace_id = ? AND type = 'google_calendar'`,
      ).bind(workspaceId).run();
      await c.env.DB.prepare(
        `INSERT INTO integrations (id, workspace_id, type, name, base_url, credentials)
         VALUES (?, ?, 'google_calendar', ?, 'https://www.googleapis.com', ?)`,
      ).bind(crypto.randomUUID(), workspaceId, tokens.accountEmail || "Google Calendar", credentials).run();
      return c.redirect("/settings?calendar=connected");
    } catch {
      return c.redirect("/settings?calendar=error");
    }
  })
  // ── Connection status for the Settings card ───────────────────────────────
  .get("/status", async (c) => {
    const configured = isConfigured(c.env);
    if (!configured) return c.json({ configured: false, connected: false, autoTrack: false });
    const row = await c.env.DB.prepare(
      `SELECT credentials, auto_track FROM integrations
       WHERE workspace_id = ? AND type = 'google_calendar' LIMIT 1`
    )
      .bind(c.get("workspaceId"))
      .first<{ credentials: string; auto_track: number }>();
    let accountEmail: string | null = null;
    if (row) {
      const tokens = await decryptJSON<GoogleCalendarTokens>(c.env.AUTH_SECRET, row.credentials);
      accountEmail = tokens.accountEmail ?? null;
    }
    return c.json({
      configured: true,
      connected: Boolean(row),
      accountEmail,
      autoTrack: Boolean(row?.auto_track),
    });
  })
  // ── Toggle auto-track for the connected calendar ──────────────────────────
  .patch(
    "/auto-track",
    zValidator("json", z.object({ enabled: z.boolean() })),
    async (c) => {
      const { enabled } = c.req.valid("json");
      await c.env.DB.prepare(
        `UPDATE integrations SET auto_track = ?
         WHERE workspace_id = ? AND type = 'google_calendar'`
      )
        .bind(enabled ? 1 : 0, c.get("workspaceId"))
        .run();
      return c.json({ ok: true, autoTrack: enabled });
    }
  )
  // ── Convert all events in a range into entries (user-triggered) ───────────
  .post(
    "/convert",
    zValidator("json", z.object({ since: z.string(), until: z.string() })),
    async (c) => {
      const { since, until } = c.req.valid("json");
      try {
        const created = await convertRange(c.env, c.get("workspaceId"), since, until);
        return c.json({ created });
      } catch {
        return c.json({ error: "Couldn't convert calendar events" }, 502);
      }
    }
  )
  // ── Read-through: external events for a range, minus already-confirmed ─────
  .get("/events", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { since, until } = c.req.query();
    if (!isConfigured(c.env) || !since || !until) return c.json([]);

    const conn = await loadConnection(c.env.DB, c.env.AUTH_SECRET, workspaceId);
    if (!conn) return c.json([]);

    try {
      const { accessToken, refreshed } = await ensureAccessToken(
        conn.tokens,
        c.env.GOOGLE_CALENDAR_CLIENT_ID!,
        c.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      );
      if (refreshed) {
        const credentials = await encryptJSON(c.env.AUTH_SECRET, conn.tokens);
        await c.env.DB.prepare(`UPDATE integrations SET credentials = ? WHERE id = ?`)
          .bind(credentials, conn.id)
          .run();
      }

      const events = await listEvents({ accessToken, since, until });

      // Drop events already confirmed into an entry so they don't double up.
      const { results } = await c.env.DB.prepare(
        `SELECT calendar_event_id FROM time_entries
         WHERE workspace_id = ? AND calendar_event_id IS NOT NULL
           AND start >= ? AND start <= ?`,
      ).bind(workspaceId, since, until).all<{ calendar_event_id: string }>();
      const confirmed = new Set(results.map((r) => r.calendar_event_id));

      return c.json(events.filter((e) => !confirmed.has(e.calendarEventId)));
    } catch {
      // Token revoked / transient Google error — surface as empty rather than 500.
      return c.json([]);
    }
  })
  // ── Disconnect ────────────────────────────────────────────────────────────
  .delete("/google", async (c) => {
    await c.env.DB.prepare(
      `DELETE FROM integrations WHERE workspace_id = ? AND type = 'google_calendar'`,
    ).bind(c.get("workspaceId")).run();
    return c.json({ ok: true });
  });
