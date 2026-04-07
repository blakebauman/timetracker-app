import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
import { workspaceMiddleware } from "./middleware/workspace";
import { timeEntriesRouter } from "./routes/time-entries";
import { projectsRouter } from "./routes/projects";
import { clientsRouter } from "./routes/clients";
import { tagsRouter } from "./routes/tags";
import { tasksRouter } from "./routes/tasks";
import { reportsRouter } from "./routes/reports";
import { websocketRouter } from "./routes/websocket";
import { createAuth } from "./auth";
export { TimerRoomDO } from "./durable-objects/TimerRoomDO";

const app = new Hono<{ Bindings: Env }>()
  .use("*", corsMiddleware)
  // Auth endpoints — handle before workspace middleware, all methods
  // Pass request origin as baseURL so Better Auth can determine it in all environments
  .use("/api/auth/*", (c) => {
    const baseURL = new URL(c.req.url).origin;
    return createAuth(c.env, baseURL).handler(c.req.raw);
  })
  // Extension sign-in: self-fetches the real auth endpoint with a trusted origin,
  // bypassing the Sec-Fetch headers that trigger Better Auth's CSRF check.
  // Registered as .use() so it executes before workspaceMiddleware in Hono's chain.
  .use("/api/ext/sign-in", async (c, next) => {
    if (c.req.method !== "POST") return next();
    const origin = new URL(c.req.url).origin;
    const body = await c.req.text();
    // Build a clean request: trusted origin, no Sec-Fetch-* headers (which trigger CSRF check)
    const cleanReq = new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body,
    });
    const resp = await createAuth(c.env, origin).handler(cleanReq);
    // Forward response with CORS header for the extension origin
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { "content-type": "application/json", "access-control-allow-origin": c.req.header("origin") ?? "*" },
    });
  })
  .use("/api/*", workspaceMiddleware)
  .route("/api/time_entries", timeEntriesRouter)
  .route("/api/projects", projectsRouter)
  .route("/api/clients", clientsRouter)
  .route("/api/tags", tagsRouter)
  .route("/api/tasks", tasksRouter)
  .route("/api/reports", reportsRouter)
  .route("/api/ws", websocketRouter);

export type AppType = typeof app;
export default app;
