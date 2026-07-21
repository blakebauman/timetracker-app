import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
import { securityHeaders } from "./middleware/security-headers";
import { rateLimit } from "./middleware/rate-limit";
import { workspaceMiddleware } from "./middleware/workspace";
import { requireFreshSession } from "./middleware/fresh-session";
import { timeEntriesRouter } from "./routes/time-entries";
import { projectsRouter } from "./routes/projects";
import { clientsRouter } from "./routes/clients";
import { tagsRouter } from "./routes/tags";
import { tasksRouter } from "./routes/tasks";
import { favoritesRouter } from "./routes/favorites";
import { recurringRouter } from "./routes/recurring";
import { reportsRouter } from "./routes/reports";
import { savedReportsRouter } from "./routes/saved-reports";
import { plannerRouter } from "./routes/planner";
import { settingsRouter } from "./routes/settings";
import { integrationsRouter } from "./routes/integrations";
import { calendarRouter } from "./routes/calendar";
import { aiRouter } from "./routes/ai";
import { assistantRouter } from "./routes/assistant";
import { adminRouter } from "./routes/admin";
import { websocketRouter } from "./routes/websocket";
import { createAuth } from "./auth";
import { runAutoTrack } from "./lib/calendar-autotrack";
import { runRecurring } from "./lib/recurring";
import { routeAgentRequest } from "agents";
export { TimerRoomDO } from "./durable-objects/TimerRoomDO";
export { ChatAgent } from "./durable-objects/ChatAgent";

// 10 attempts per minute on auth endpoints. Relaxed in the Vite dev server
// (which is what `pnpm dev` and the CI e2e run use) so the Playwright suite's
// one-signup-per-test pattern can't trip it — production builds keep 10/min.
const authRateLimit = rateLimit(import.meta.env.DEV ? 1000 : 10, 60_000);
// AI calls have real latency/cost — cap per-workspace request rate
const aiRateLimit = rateLimit(20, 60_000);
// Nudges are deterministic but read through to Google Calendar. The client
// polls at 5-minute intervals, so 6/min is pure headroom — this only guards
// against a runaway poller re-introducing a tight refetch loop. Relaxed in
// dev for the same Playwright reason as authRateLimit.
const nudgesRateLimit = rateLimit(import.meta.env.DEV ? 1000 : 6, 60_000);
// /test, /push and /calendar/convert each trigger an outbound fetch to a
// third-party host — cap them so an authenticated caller can't use the worker as
// a request amplifier. Relaxed in dev for the Playwright suite.
const outboundRateLimit = rateLimit(import.meta.env.DEV ? 1000 : 30, 60_000);

const app = new Hono<{ Bindings: Env }>()
  .use("*", corsMiddleware)
  .use("*", securityHeaders)
  // Auth endpoints — rate limited, no workspace middleware needed
  .use("/api/auth/sign-in/*", authRateLimit)
  .use("/api/auth/sign-up/*", authRateLimit)
  .use("/api/auth/change-password", authRateLimit)
  .use("/api/auth/email-otp/send-verification-otp", authRateLimit)
  .use("/api/auth/sign-in/magic-link", authRateLimit)
  // Re-impose the fresh-session gate on the sensitive profile mutations that
  // Better Auth's freshAge:0 (needed for the sessions card) would otherwise leave
  // ungated. See middleware/fresh-session.ts.
  .use("/api/auth/update-user", requireFreshSession)
  .use("/api/auth/unlink-account", requireFreshSession)
  .on(["GET", "POST"], "/api/auth/*", (c) => {
    const origin = new URL(c.req.url).origin;
    return createAuth(c.env, origin).handler(c.req.raw);
  })
  .use("/api/*", workspaceMiddleware)
  .use("/api/ai/*", aiRateLimit)
  // track-event hits Workers AI (project inference); nudge polling is capped well
  // above its 5-min cadence. (Assistant chat streams via the ChatAgent DO, not here.)
  .use("/api/assistant/track-event", aiRateLimit)
  .use("/api/assistant/nudges", nudgesRateLimit)
  .use("/api/integrations/*", outboundRateLimit)
  .use("/api/calendar/convert", outboundRateLimit)
  .route("/api/time_entries", timeEntriesRouter)
  .route("/api/projects", projectsRouter)
  .route("/api/clients", clientsRouter)
  .route("/api/tags", tagsRouter)
  .route("/api/tasks", tasksRouter)
  .route("/api/favorites", favoritesRouter)
  .route("/api/recurring", recurringRouter)
  .route("/api/reports", reportsRouter)
  .route("/api/saved-reports", savedReportsRouter)
  .route("/api/planner", plannerRouter)
  .route("/api/settings", settingsRouter)
  .route("/api/integrations", integrationsRouter)
  .route("/api/calendar", calendarRouter)
  .route("/api/ai", aiRouter)
  .route("/api/assistant", assistantRouter)
  .route("/api/admin", adminRouter)
  .route("/api/ws", websocketRouter);

export type AppType = typeof app;

/**
 * Resolve the caller's workspace id from their session (cookie or bearer), the
 * same way workspaceMiddleware does. Returns null when unauthenticated.
 */
async function resolveWorkspaceId(request: Request, env: Env): Promise<string | null> {
  const origin = new URL(request.url).origin;
  const auth = createAuth(env, origin);
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result) return null;
  let workspaceId = result.session.activeOrganizationId;
  if (!workspaceId) {
    const orgs = await auth.api.listOrganizations({ headers: request.headers });
    if (orgs.length === 0) return null;
    workspaceId = orgs[0].id;
    await auth.api.setActiveOrganization({
      body: { organizationId: workspaceId },
      headers: request.headers,
    });
  }
  return workspaceId;
}

/**
 * Gate the Agents SDK routes. The client connects to /agents/chat-agent/<any>;
 * we authenticate, then FORCE the instance name to the caller's workspace id so
 * a client can never reach another workspace's ChatAgent — the same server-side
 * routing guarantee as the timer WebSocket (routes/websocket.ts).
 */
async function handleAgentRequest(request: Request, env: Env): Promise<Response> {
  const workspaceId = await resolveWorkspaceId(request, env);
  if (!workspaceId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  // /agents/<kebab-class>/<instance>[/subpath] → pin <instance> to the workspace.
  const segments = url.pathname.split("/"); // ["", "agents", "chat-agent", "<instance>", ...]
  if (segments.length >= 4) {
    segments[3] = workspaceId;
    url.pathname = segments.join("/");
  }
  const rewritten = new Request(url, request);
  return (await routeAgentRequest(rewritten, env)) ?? new Response("Not found", { status: 404 });
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    if (new URL(request.url).pathname.startsWith("/agents/")) {
      return handleAgentRequest(request, env);
    }
    return app.fetch(request, env, ctx);
  },
  // Cron (*/5): materialize finished calendar events for auto-track workspaces
  // and any due recurring-entry occurrences.
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([runAutoTrack(env), runRecurring(env)]));
  },
} satisfies ExportedHandler<Env>;
