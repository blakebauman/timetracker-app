import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";

export const workspaceMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>(async (c, next) => {
  // Auth and extension sign-in routes don't need workspace resolution
  if (c.req.path.startsWith("/api/auth/") || c.req.path.startsWith("/api/ext/")) {
    await next();
    return;
  }

  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Resolve this user's workspace
  const row = await c.env.DB.prepare(
    `SELECT id FROM workspaces WHERE userId = ? LIMIT 1`
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
