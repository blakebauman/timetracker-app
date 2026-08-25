import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { encryptJSON } from "../lib/crypto";
import {
  CALENDAR_PROVIDERS,
  PROVIDER_IDS,
  providerCredentials,
  toProviderId,
  type CalendarProviderId,
} from "../lib/calendar-providers";
import {
  loadCalendarConnections,
  fetchWorkspaceEvents,
} from "../lib/calendar-connections";
import { convertRange } from "../lib/calendar-autotrack";

const STATE_COOKIE = "tt_cal_state";

function redirectUri(reqUrl: string, provider: CalendarProviderId): string {
  return `${new URL(reqUrl).origin}/api/calendar/${provider}/callback`;
}

export const calendarRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  // ── Connection status, one row per configured provider ────────────────────
  //
  // An array rather than a single object: a workspace can hold a work calendar
  // and a personal one at once, and the Settings card renders whatever the
  // server says it supports rather than hard-coding providers.
  .get("/status", async (c) => {
    const workspaceId = c.get("workspaceId");
    const connections = await loadCalendarConnections(c.env, workspaceId);

    return c.json(
      PROVIDER_IDS.map((id) => {
        const provider = CALENDAR_PROVIDERS[id];
        const conn = connections.find((x) => x.provider.id === id);
        return {
          provider: id,
          label: provider.label,
          configured: Boolean(providerCredentials(c.env, id)),
          connected: Boolean(conn),
          accountEmail: conn?.tokens.accountEmail || null,
          autoTrack: conn?.autoTrack ?? false,
        };
      })
    );
  })
  // ── Toggle auto-track for one provider's connection ───────────────────────
  .patch(
    "/auto-track",
    zValidator(
      "json",
      z.object({
        enabled: z.boolean(),
        provider: z.enum(["google", "microsoft"]).default("google"),
      })
    ),
    async (c) => {
      const { enabled, provider } = c.req.valid("json");
      await c.env.DB.prepare(
        `UPDATE integrations SET auto_track = ?
         WHERE workspace_id = ? AND type = ?`
      )
        .bind(enabled ? 1 : 0, c.get("workspaceId"), CALENDAR_PROVIDERS[provider].integrationType)
        .run();
      return c.json({ ok: true, autoTrack: enabled, provider });
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
  // ── Read-through: external events for a range, minus already-confirmed ────
  .get("/events", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { since, until } = c.req.query();
    if (!since || !until) return c.json([]);

    const events = await fetchWorkspaceEvents(c.env, workspaceId, since, until);
    if (!events.length) return c.json([]);

    // Drop events already confirmed into an entry so they don't double up.
    const { results } = await c.env.DB.prepare(
      `SELECT calendar_event_id FROM time_entries
       WHERE workspace_id = ? AND calendar_event_id IS NOT NULL
         AND start >= ? AND start <= ?`
    )
      .bind(workspaceId, since, until)
      .all<{ calendar_event_id: string }>();
    const confirmed = new Set(results.map((r) => r.calendar_event_id));

    return c.json(events.filter((e) => !confirmed.has(e.calendarEventId)));
  })
  // ── Begin OAuth: redirect to the provider's consent screen ────────────────
  .get("/:provider/connect", (c) => {
    const provider = toProviderId(c.req.param("provider"));
    if (!provider) return c.redirect("/settings?calendar=error");

    const creds = providerCredentials(c.env, provider);
    if (!creds) return c.redirect("/settings?calendar=not_configured");

    const state = crypto.randomUUID();
    // Bind the initiating workspace AND provider into the httpOnly state cookie:
    // the callback must not land a connection in a different workspace if the
    // user switches mid-flow, and must not mistake one provider's callback for
    // the other's. The OAuth `state` param stays the raw token.
    setCookie(c, STATE_COOKIE, `${state}.${provider}.${c.get("workspaceId")}`, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    });
    return c.redirect(
      CALENDAR_PROVIDERS[provider].buildConsentUrl({
        clientId: creds.clientId,
        redirectUri: redirectUri(c.req.url, provider),
        state,
        tenant: c.env.MICROSOFT_CALENDAR_TENANT,
      })
    );
  })
  // ── OAuth callback: exchange the code and store encrypted tokens ──────────
  .get("/:provider/callback", async (c) => {
    const workspaceId = c.get("workspaceId");
    const provider = toProviderId(c.req.param("provider"));
    if (!provider) return c.redirect("/settings?calendar=error");

    const { code, state, error } = c.req.query();
    const expected = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });

    // Cookie is "<state>.<provider>.<initiating workspace>".
    const [expectedState, expectedProvider, ...rest] = (expected ?? "").split(".");
    const expectedWorkspace = rest.join(".");
    if (
      error ||
      !code ||
      !state ||
      state !== expectedState ||
      expectedProvider !== provider ||
      expectedWorkspace !== workspaceId
    ) {
      return c.redirect("/settings?calendar=error");
    }

    const creds = providerCredentials(c.env, provider);
    if (!creds) return c.redirect("/settings?calendar=not_configured");

    try {
      const tokens = await CALENDAR_PROVIDERS[provider].exchangeCode({
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        code,
        redirectUri: redirectUri(c.req.url, provider),
        tenant: c.env.MICROSOFT_CALENDAR_TENANT,
      });
      const credentials = await encryptJSON(c.env.AUTH_SECRET, tokens);
      const type = CALENDAR_PROVIDERS[provider].integrationType;
      // One connection per provider per workspace: replace any existing one.
      await c.env.DB.prepare(
        `DELETE FROM integrations WHERE workspace_id = ? AND type = ?`
      )
        .bind(workspaceId, type)
        .run();
      await c.env.DB.prepare(
        `INSERT INTO integrations (id, workspace_id, type, name, base_url, credentials)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          workspaceId,
          type,
          tokens.accountEmail || CALENDAR_PROVIDERS[provider].label,
          provider === "google" ? "https://www.googleapis.com" : "https://graph.microsoft.com",
          credentials
        )
        .run();
      return c.redirect("/settings?calendar=connected");
    } catch {
      return c.redirect("/settings?calendar=error");
    }
  })
  // ── Disconnect one provider ───────────────────────────────────────────────
  .delete("/:provider", async (c) => {
    const provider = toProviderId(c.req.param("provider"));
    if (!provider) return c.json({ error: "Unknown calendar provider" }, 404);
    await c.env.DB.prepare(
      `DELETE FROM integrations WHERE workspace_id = ? AND type = ?`
    )
      .bind(c.get("workspaceId"), CALENDAR_PROVIDERS[provider].integrationType)
      .run();
    return c.json({ ok: true });
  });
