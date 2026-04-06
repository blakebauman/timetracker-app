import { Hono } from "hono";

export const tagsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM tags WHERE workspace_id = ? ORDER BY name ASC`
    )
      .bind(workspaceId)
      .all<Record<string, unknown>>();

    return c.json(
      results.map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        name: r.name,
      }))
    );
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    await c.env.DB.prepare(
      `DELETE FROM tags WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), workspaceId)
      .run();
    return c.json({ ok: true });
  });
