import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { encryptJSON, decryptJSON } from "../lib/crypto";
import {
  buildConsentUrl,
  exchangeCode,
  ensureAccessToken,
  listEvents,
  type GoogleCalendarTokens,
} from "../lib/google-calendar";

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
    setCookie(c, STATE_COOKIE, state, {
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

    if (error || !code || !state || state !== expected) {
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
    if (!configured) return c.json({ configured: false, connected: false });
    const conn = await loadConnection(c.env.DB, c.env.AUTH_SECRET, c.get("workspaceId"));
    return c.json({
      configured: true,
      connected: Boolean(conn),
      accountEmail: conn?.tokens.accountEmail ?? null,
    });
  })
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
