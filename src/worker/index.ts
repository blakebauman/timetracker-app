import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
import { securityHeaders } from "./middleware/security-headers";
import { rateLimit } from "./middleware/rate-limit";
import { workspaceMiddleware } from "./middleware/workspace";
import { timeEntriesRouter } from "./routes/time-entries";
import { projectsRouter } from "./routes/projects";
import { clientsRouter } from "./routes/clients";
import { tagsRouter } from "./routes/tags";
import { tasksRouter } from "./routes/tasks";
import { favoritesRouter } from "./routes/favorites";
import { recurringRouter } from "./routes/recurring";
import { reportsRouter } from "./routes/reports";
import { savedReportsRouter } from "./routes/saved-reports";
import { settingsRouter } from "./routes/settings";
import { integrationsRouter } from "./routes/integrations";
import { calendarRouter } from "./routes/calendar";
import { aiRouter } from "./routes/ai";
import { assistantRouter } from "./routes/assistant";
import { websocketRouter } from "./routes/websocket";
import { createAuth } from "./auth";
import { runAutoTrack } from "./lib/calendar-autotrack";
import { runRecurring } from "./lib/recurring";
export { TimerRoomDO } from "./durable-objects/TimerRoomDO";

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

const app = new Hono<{ Bindings: Env }>()
  .use("*", corsMiddleware)
  .use("*", securityHeaders)
  // Auth endpoints — rate limited, no workspace middleware needed
  .use("/api/auth/sign-in/*", authRateLimit)
  .use("/api/auth/sign-up/*", authRateLimit)
  .use("/api/auth/change-password", authRateLimit)
  .use("/api/auth/email-otp/send-verification-otp", authRateLimit)
  .use("/api/auth/sign-in/magic-link", authRateLimit)
  .on(["GET", "POST"], "/api/auth/*", (c) => {
    const origin = new URL(c.req.url).origin;
    return createAuth(c.env, origin).handler(c.req.raw);
  })
  .use("/api/*", workspaceMiddleware)
  .use("/api/ai/*", aiRateLimit)
  // Aski chat + track-event hit Workers AI; nudge polling is capped well above
  // its 5-min cadence.
  .use("/api/assistant/chat", aiRateLimit)
  .use("/api/assistant/track-event", aiRateLimit)
  .use("/api/assistant/nudges", nudgesRateLimit)
  .route("/api/time_entries", timeEntriesRouter)
  .route("/api/projects", projectsRouter)
  .route("/api/clients", clientsRouter)
  .route("/api/tags", tagsRouter)
  .route("/api/tasks", tasksRouter)
  .route("/api/favorites", favoritesRouter)
  .route("/api/recurring", recurringRouter)
  .route("/api/reports", reportsRouter)
  .route("/api/saved-reports", savedReportsRouter)
  .route("/api/settings", settingsRouter)
  .route("/api/integrations", integrationsRouter)
  .route("/api/calendar", calendarRouter)
  .route("/api/ai", aiRouter)
  .route("/api/assistant", assistantRouter)
  .route("/api/ws", websocketRouter);

export type AppType = typeof app;

export default {
  fetch: app.fetch,
  // Cron (*/5): materialize finished calendar events for auto-track workspaces
  // and any due recurring-entry occurrences.
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([runAutoTrack(env), runRecurring(env)]));
  },
} satisfies ExportedHandler<Env>;
