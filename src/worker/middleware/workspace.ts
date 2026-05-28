import { createMiddleware } from "hono/factory";
import { getSession } from "../auth";

export const workspaceMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>(async (c, next) => {
  const session = await getSession(c.env.DB, c);

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const row = await c.env.DB.prepare(
    `SELECT id FROM workspaces WHERE userId = ? LIMIT 1`,
  )
    .bind(session.user.id)
    .first<{ id: string }>();

  if (!row) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  c.set("workspaceId", row.id);
  c.set("userId", session.user.id);
  await next();
});
