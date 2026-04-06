import { createMiddleware } from "hono/factory";

export const workspaceMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>(async (c, next) => {
  // For now, always use the default workspace (no auth)
  const workspaceId =
    c.req.header("X-Workspace-Id") ??
    c.req.query("workspaceId") ??
    "default";
  c.set("workspaceId", workspaceId);
  await next();
});
