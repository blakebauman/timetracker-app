import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { corsMiddleware, isAllowedOrigin } from "./middleware/cors";
import { securityHeaders, applySecurityHeaders } from "./middleware/security-headers";
import { onError, notFound, payloadTooLarge } from "./lib/http-errors";
import { bodyTooLarge, limitBody } from "./lib/body-guard";
import { rateLimit, rateLimitOrReject, byUser, byWorkspace } from "./middleware/rate-limit";
import { workspaceMiddleware, resolveWorkspace } from "./middleware/workspace";
import { requireFreshSession } from "./middleware/fresh-session";
import { timeEntriesRouter } from "./routes/time-entries";
import { projectsRouter } from "./routes/projects";
import { clientsRouter } from "./routes/clients";
import { tagsRouter } from "./routes/tags";
import { tasksRouter } from "./routes/tasks";
import { favoritesRouter } from "./routes/favorites";
import { recurringRouter } from "./routes/recurring";
import { draftsRouter } from "./routes/drafts";
import { reportsRouter } from "./routes/reports";
import { savedReportsRouter } from "./routes/saved-reports";
import { plannerRouter } from "./routes/planner";
import { settingsRouter } from "./routes/settings";
import { integrationsRouter } from "./routes/integrations";
import { calendarRouter } from "./routes/calendar";
import { aiRouter } from "./routes/ai";
import { assistantRouter } from "./routes/assistant";
import { adminRouter } from "./routes/admin";
import { apiKeysRouter } from "./routes/api-keys";
import { websocketRouter } from "./routes/websocket";
import { createAuth } from "./auth";
import { runAutoTrack } from "./lib/calendar-autotrack";
import { runRecurring } from "./lib/recurring";
import { runDigests } from "./lib/digest";
import { routeAgentRequest } from "agents";
import { createLegacyMcpHandler } from "agents/mcp";
import { buildMcpServer } from "./mcp/server";
import { resolveApiKey, touchApiKey } from "./lib/api-keys";
export { TimerRoom } from "./durable-objects/TimerRoom";
export { ChatAgent } from "./durable-objects/ChatAgent";

// Limits live on Workers Rate Limiting bindings (wrangler.jsonc `ratelimits`,
// middleware/rate-limit.ts) so they hold across isolates. The dev server the
// Playwright suite runs against consults the binding but never rejects, so the
// one-signup-per-test pattern can't trip it.
//
// 10 attempts per minute per IP on the credential endpoints the app fronts
// itself; Better Auth's own DB-backed limiter (auth.ts) covers the rest of
// /api/auth/*.
const authRateLimit = rateLimit((env) => env.RL_AUTH);
// AI calls have real latency/cost — cap per workspace, the unit that pays.
const aiRateLimit = rateLimit((env) => env.RL_AI, byWorkspace);
// Nudges are deterministic but read through to Google Calendar. The client
// polls at 5-minute intervals, so 6/min is pure headroom — this only guards
// against a runaway poller re-introducing a tight refetch loop.
const nudgesRateLimit = rateLimit((env) => env.RL_NUDGES, byUser);
// /test, /push and /calendar/convert each trigger an outbound fetch to a
// third-party host — cap them so an authenticated caller can't use the worker as
// a request amplifier.
const outboundRateLimit = rateLimit((env) => env.RL_OUTBOUND, byWorkspace);
// "Send me a digest now" costs an outbound email and an AI call. Deliberately
// tighter than the other limits: the endpoint mails a real inbox, so an
// authenticated caller shouldn't be able to use it as a flooding primitive.
const emailRateLimit = rateLimit((env) => env.RL_EMAIL, byUser);
// /reports/detailed buffers up to 10k joined rows per call and the reports
// routes had no ceiling at all — a tight refetch loop was a self-DoS.
const reportsRateLimit = rateLimit((env) => env.RL_REPORTS, byUser);

// Request bodies are buffered before validation, so cap them before anything
// reads them. Nothing legitimate is large: the biggest payload in the app is a
// 500-row planner import (~100 KiB); auth payloads are a few KiB.
const API_BODY_MAX = 1024 * 1024;
const AUTH_BODY_MAX = 64 * 1024;
// /mcp and /agents/* are answered before Hono — see bodyTooLarge/limitBody.
const RAW_BODY_MAX = 256 * 1024;

const app = new Hono<{ Bindings: Env }>()
  .use("*", corsMiddleware)
  .use("*", securityHeaders)
  .use("/api/auth/*", bodyLimit({ maxSize: AUTH_BODY_MAX, onError: payloadTooLarge }))
  .use("/api/*", bodyLimit({ maxSize: API_BODY_MAX, onError: payloadTooLarge }))
  // Authenticated JSON must never be stored by any shared or disk cache — a
  // zone-level cache rule change would otherwise be one step from leaking user
  // data. The WS upgrade (101) response from the DO has immutable headers.
  .use("/api/*", async (c, next) => {
    await next();
    if (c.res.status !== 101) {
      try {
        c.res.headers.set("Cache-Control", "no-store");
      } catch {
        // Immutable response headers (upgraded/proxied) — nothing to cache anyway.
      }
    }
  })
  // Auth endpoints — rate limited, no workspace middleware needed
  .use("/api/auth/sign-in/*", authRateLimit)
  .use("/api/auth/sign-up/*", authRateLimit)
  .use("/api/auth/change-password", authRateLimit)
  .use("/api/auth/email-otp/send-verification-otp", authRateLimit)
  // invite-member sends an email per call — throttle it like the other senders.
  .use("/api/auth/organization/invite-member", authRateLimit)
  .use("/api/auth/sign-in/magic-link", authRateLimit)
  // Re-impose the fresh-session gate on the sensitive profile mutations that
  // Better Auth's freshAge:0 (needed for the sessions card) would otherwise leave
  // ungated. See middleware/fresh-session.ts. delete-user is included: with
  // freshAge 0, Better Auth skips its own freshness check on deletion entirely
  // (the request-the-email step; the emailed callback stands on its one-time
  // token plus the session cookie), so without this gate any
  // stolen cookie or bearer token could irreversibly delete the account.
  .use("/api/auth/update-user", requireFreshSession)
  .use("/api/auth/unlink-account", requireFreshSession)
  .use("/api/auth/delete-user", requireFreshSession)
  .on(["GET", "POST"], "/api/auth/*", (c) => {
    const origin = new URL(c.req.url).origin;
    return createAuth(c.env, origin).handler(c.req.raw);
  })
  // Unauthenticated liveness probe for an uptime monitor: is the worker up and
  // can it reach D1. Deliberately says nothing else — no version, no env name,
  // no bindings — and sits before workspaceMiddleware so a monitor needs no
  // session.
  .get("/api/health", async (c) => {
    try {
      await c.env.DB.prepare("SELECT 1").first();
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  })
  .use("/api/*", workspaceMiddleware)
  .use("/api/ai/*", aiRateLimit)
  // track-event hits Workers AI (project inference); nudge polling is capped well
  // above its 5-min cadence. (Assistant chat streams via the ChatAgent DO, not here.)
  .use("/api/assistant/track-event", aiRateLimit)
  .use("/api/assistant/nudges", nudgesRateLimit)
  // Drafting a day costs one Workers AI call plus a Google Calendar read-through.
  .use("/api/drafts/generate", aiRateLimit)
  .use("/api/settings/digest/send", emailRateLimit)
  .use("/api/integrations/*", outboundRateLimit)
  .use("/api/calendar/convert", outboundRateLimit)
  .use("/api/reports/*", reportsRateLimit)
  .route("/api/time_entries", timeEntriesRouter)
  .route("/api/projects", projectsRouter)
  .route("/api/clients", clientsRouter)
  .route("/api/tags", tagsRouter)
  .route("/api/tasks", tasksRouter)
  .route("/api/favorites", favoritesRouter)
  .route("/api/recurring", recurringRouter)
  .route("/api/drafts", draftsRouter)
  .route("/api/reports", reportsRouter)
  .route("/api/saved-reports", savedReportsRouter)
  .route("/api/planner", plannerRouter)
  .route("/api/settings", settingsRouter)
  .route("/api/integrations", integrationsRouter)
  .route("/api/calendar", calendarRouter)
  .route("/api/ai", aiRouter)
  .route("/api/assistant", assistantRouter)
  .route("/api/admin", adminRouter)
  .route("/api/keys", apiKeysRouter)
  .route("/api/ws", websocketRouter)
  // JSON 404s, and a 500 that carries a request id, no-store and the security
  // headers (a throw skips every middleware's post-next body).
  .notFound(notFound)
  .onError(onError);

export type AppType = typeof app;

/**
 * Gate the Agents SDK routes. The client connects to /agents/chat-agent/<any>;
 * we authenticate (with the same membership re-verification as /api/*), then
 * FORCE the instance name to the caller's workspace id so a client can never
 * reach another workspace's ChatAgent — the same server-side routing guarantee
 * as the timer WebSocket (routes/websocket.ts).
 */
async function handleAgentRequest(request: Request, env: Env): Promise<Response> {
  const tooLarge = bodyTooLarge(request, RAW_BODY_MAX);
  if (tooLarge) return tooLarge;

  // Same Origin gate as /api/ws: a cross-site page must not be able to open
  // the chat WebSocket with the user's cookies. Only the upgrade carries an
  // Origin a browser is forced to send, so plain HTTP calls are left alone.
  if (
    request.headers.get("Upgrade")?.toLowerCase() === "websocket" &&
    !isAllowedOrigin(request.headers.get("Origin"))
  ) {
    return new Response("Forbidden origin", { status: 403 });
  }

  const resolved = await resolveWorkspace(env, request);
  if (!resolved.ok) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  // /agents/<kebab-class>/<instance>[/subpath] → pin <instance> to the workspace.
  // Only the chat agent is reachable this way, and only with an instance
  // segment to pin: a bare /agents/chat-agent (nothing to rewrite) or
  // /agents/timer-room/* (the timer DO has its own authenticated route) used to
  // fall through to routeAgentRequest unpinned.
  const segments = url.pathname.split("/"); // ["", "agents", "chat-agent", "<instance>", ...]
  if (segments[2] !== "chat-agent" || segments.length < 4 || !segments[3]) {
    return new Response("Not found", { status: 404 });
  }
  segments[3] = resolved.workspaceId;
  url.pathname = segments.join("/");
  const rewritten = new Request(url, limitBody(request, RAW_BODY_MAX));
  return (await routeAgentRequest(rewritten, env)) ?? new Response("Not found", { status: 404 });
}

/**
 * The MCP endpoint: /mcp, Streamable HTTP, authenticated by a workspace API key.
 *
 * Deliberately NOT behind the session middleware. An MCP client is a program
 * with no cookie jar, and it holds a long-lived credential the user can see and
 * revoke in Settings — which is a different, and more revocable, thing than a
 * browser session token. `resolveApiKey` refuses anything that isn't one of our
 * keys rather than quietly accepting a session bearer, so a caller who thinks
 * they are presenting an API key is told when they aren't.
 *
 * A fresh server is built per request, bound to the resolved workspace: no tool
 * ever takes a workspace id as an argument, so nothing a model can invent
 * reaches a tenant boundary.
 */
async function handleMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const tooLarge = bodyTooLarge(request, RAW_BODY_MAX);
  if (tooLarge) return tooLarge;

  const resolved = await resolveApiKey(env.DB, request.headers.get("Authorization"));
  if (!resolved) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message:
          "Send an API key as `Authorization: Bearer tt_live_…`. Create one in Settings → Workspace → API keys.",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          // Names the scheme so a compliant client knows what to send back.
          "WWW-Authenticate": 'Bearer realm="timetracker"',
          "Cache-Control": "no-store",
        },
      }
    );
  }

  // Limited AFTER authentication and keyed by the key's row id: an attacker
  // can't burn a key's budget without holding it, and a leaked key can't turn
  // draft_day (Workers AI + a calendar read per call) into an unbounded bill.
  const limited = await rateLimitOrReject(env.RL_MCP, `mcp:${resolved.id}`);
  if (limited) return limited;

  ctx.waitUntil(touchApiKey(env.DB, resolved.id));

  const server = buildMcpServer({
    env,
    workspaceId: resolved.workspaceId,
    userId: resolved.userId,
    scope: resolved.scope,
  });
  // Agents SDK ≥ 0.20: createMcpHandler expects an MCP SDK v2 factory and
  // only shims a v1 McpServer instance with a deprecation warning. This server
  // is built on SDK v1 (@modelcontextprotocol/sdk 1.x), so call the legacy
  // handler by name; moving to v2 is its own change.
  return createLegacyMcpHandler(server, { route: "/mcp" })(
    limitBody(request, RAW_BODY_MAX),
    env,
    ctx
  );
}

/**
 * The response policy Hono's middleware gives /api/* (no-store + the security
 * headers), applied to everything the two pre-Hono handlers return — their
 * 401s and 404s included. Never touches a WebSocket upgrade, and re-wraps
 * rather than mutates: subrequest response headers are immutable.
 */
function finishRawResponse(response: Response, request: Request): Response {
  if (response.status === 101 || response.webSocket) return response;
  const wrapped = new Response(response.body, response);
  wrapped.headers.set("Cache-Control", "no-store");
  applySecurityHeaders(wrapped.headers, new URL(request.url).protocol === "https:");
  return wrapped;
}

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/agents/")) {
      return finishRawResponse(await handleAgentRequest(request, env), request);
    }
    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      return finishRawResponse(await handleMcpRequest(request, env, ctx), request);
    }
    return app.fetch(request, env, ctx);
  },
  // Cron (*/5): materialize finished calendar events for auto-track workspaces,
  // any due recurring-entry occurrences, and any digest whose local send hour
  // has arrived. Each sweep swallows its own per-workspace/per-user errors, so
  // one broken connection can't stop the others.
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // allSettled, not all: the per-row try/catch inside each sweep can't cover
    // its own driving query, and one job's rejection must neither mask the
    // other two nor surface as an unhandled rejection with no name on it.
    const jobs = [
      ["autotrack", runAutoTrack(env)],
      ["recurring", runRecurring(env)],
      ["digests", runDigests(env)],
    ] as const;
    ctx.waitUntil(
      Promise.allSettled(jobs.map(([, p]) => p)).then((results) => {
        results.forEach((r, i) => {
          if (r.status === "rejected") {
            console.error("cron: job failed", { job: jobs[i][0], error: String(r.reason) });
          }
        });
      })
    );
  },
} satisfies ExportedHandler<Env>;
