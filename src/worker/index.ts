import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
import { workspaceMiddleware } from "./middleware/workspace";
import { timeEntriesRouter } from "./routes/time-entries";
import { projectsRouter } from "./routes/projects";
import { clientsRouter } from "./routes/clients";
import { tagsRouter } from "./routes/tags";
import { reportsRouter } from "./routes/reports";
import { websocketRouter } from "./routes/websocket";
export { TimerRoomDO } from "./durable-objects/TimerRoomDO";

const app = new Hono<{ Bindings: Env }>()
  .use("*", corsMiddleware)
  .use("/api/*", workspaceMiddleware)
  .route("/api/time_entries", timeEntriesRouter)
  .route("/api/projects", projectsRouter)
  .route("/api/clients", clientsRouter)
  .route("/api/tags", tagsRouter)
  .route("/api/reports", reportsRouter)
  .route("/api/ws", websocketRouter);

export type AppType = typeof app;
export default app;
