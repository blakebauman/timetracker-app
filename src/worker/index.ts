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
import { reportsRouter } from "./routes/reports";
import { integrationsRouter } from "./routes/integrations";
import { aiRouter } from "./routes/ai";
import { websocketRouter } from "./routes/websocket";
import { authRouter, handleSignIn } from "./routes/auth";
export { TimerRoomDO } from "./durable-objects/TimerRoomDO";

// 10 attempts per minute on auth endpoints
const authRateLimit = rateLimit(10, 60_000);
// AI calls have real latency/cost — cap per-workspace request rate
const aiRateLimit = rateLimit(20, 60_000);

const app = new Hono<{ Bindings: Env }>()
  .use("*", corsMiddleware)
  .use("*", securityHeaders)
  // Auth endpoints — rate limited, no workspace middleware needed
  .use("/api/auth/sign-in/*", authRateLimit)
  .use("/api/auth/sign-up/*", authRateLimit)
  .use("/api/auth/change-password", authRateLimit)
  .use("/api/ext/sign-in", authRateLimit)
  .route("/api/auth", authRouter)
  // Extension sign-in: same handler as /api/auth/sign-in/email.
  // The extension can't set cookies so it reads the token from the response body.
  .post("/api/ext/sign-in", handleSignIn)
  .use("/api/*", workspaceMiddleware)
  .use("/api/ai/*", aiRateLimit)
  .route("/api/time_entries", timeEntriesRouter)
  .route("/api/projects", projectsRouter)
  .route("/api/clients", clientsRouter)
  .route("/api/tags", tagsRouter)
  .route("/api/tasks", tasksRouter)
  .route("/api/reports", reportsRouter)
  .route("/api/integrations", integrationsRouter)
  .route("/api/ai", aiRouter)
  .route("/api/ws", websocketRouter);

export type AppType = typeof app;
export default app;
