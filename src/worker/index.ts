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
  .use("/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw))
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
