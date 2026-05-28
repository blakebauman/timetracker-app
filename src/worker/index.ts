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
import { authRouter, handleSignIn } from "./routes/auth";
export { TimerRoomDO } from "./durable-objects/TimerRoomDO";

const app = new Hono<{ Bindings: Env }>()
  .use("*", corsMiddleware)
  // Auth endpoints — no workspace middleware needed
  .route("/api/auth", authRouter)
  // Extension sign-in: same handler as /api/auth/sign-in/email.
  // The extension can't set cookies so it reads the token from the response body.
  .post("/api/ext/sign-in", handleSignIn)
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
