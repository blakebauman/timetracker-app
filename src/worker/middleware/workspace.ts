import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";

export const workspaceMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>(async (c, next) => {
  const origin = new URL(c.req.url).origin;
  const auth = createAuth(c.env, origin);

  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const { session, user } = result;

  let workspaceId = session.activeOrganizationId;

  if (!workspaceId) {
    // First request after signup/sign-in before any org-switch has happened —
    // fall back to the user's first organization and persist it as active.
    const orgs = await auth.api.listOrganizations({ headers: c.req.raw.headers });
    if (orgs.length === 0) {
      return c.json({ error: "Workspace not found" }, 404);
    }
    workspaceId = orgs[0].id;
    await auth.api.setActiveOrganization({
      body: { organizationId: workspaceId },
      headers: c.req.raw.headers,
    });
  }

  c.set("workspaceId", workspaceId);
  c.set("userId", user.id);
  await next();
});
