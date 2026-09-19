import { Hono } from "hono";
import { APIError } from "better-auth";
import { createAuth } from "../auth";

// Admin-only user removal. Better Auth's removeUser deletes the user row
// (sessions/accounts/member rows cascade via FKs) but knows nothing about the
// app's data, so this endpoint also purges workspaces the user solely owned —
// deleting a `workspaces` row cascades every app table except saved_reports,
// which has no FK and is deleted explicitly.
export const adminRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>().delete("/users/:id", async (c) => {
  const targetId = c.req.param("id");
  if (targetId === c.get("userId")) {
    return c.json({ error: "You can't remove your own account from here" }, 400);
  }

  const auth = createAuth(c.env, new URL(c.req.url).origin);

  // Captured before removal — the member rows cascade away with the user.
  const { results: owned } = await c.env.DB.prepare(
    `SELECT organizationId AS id FROM member WHERE userId = ? AND role = 'owner'`
  )
    .bind(targetId)
    .all<{ id: string }>();

  // Authorization lives in better-auth: this throws unless the caller's
  // session has the admin role. Nothing is purged before it succeeds.
  try {
    await auth.api.removeUser({ body: { userId: targetId }, headers: c.req.raw.headers });
  } catch (err) {
    if (err instanceof APIError) {
      return c.json({ error: err.message }, (err.statusCode as 403) || 403);
    }
    return c.json({ error: "Failed to remove user" }, 500);
  }

  // Purge workspaces that now have no members left (solo-owned ones). A
  // workspace shared with remaining members is left untouched.
  let purged = 0;
  for (const ws of owned) {
    const remaining = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM member WHERE organizationId = ?`
    )
      .bind(ws.id)
      .first<{ n: number }>();
    if ((remaining?.n ?? 0) > 0) continue;
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM saved_reports WHERE workspace_id = ?`).bind(ws.id),
      c.env.DB.prepare(`DELETE FROM workspaces WHERE id = ?`).bind(ws.id),
    ]);
    purged++;
  }
  // Their saved reports in workspaces they were merely a member of.
  await c.env.DB.prepare(`DELETE FROM saved_reports WHERE user_id = ?`).bind(targetId).run();

  return c.json({ ok: true, purgedWorkspaces: purged });
});
