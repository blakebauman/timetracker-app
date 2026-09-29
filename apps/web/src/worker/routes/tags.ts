import { Hono } from "hono";
import { zValidator } from "../lib/validate";
import { UpdateTagSchema } from "@timetracker/core/schemas";

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
        color: (r.color as string | null) ?? "#64748b",
      }))
    );
  })
  .patch("/:id", zValidator("json", UpdateTagSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { color } = c.req.valid("json");
    await c.env.DB.prepare(
      `UPDATE tags SET color = ? WHERE id = ? AND workspace_id = ?`
    )
      .bind(color, c.req.param("id"), workspaceId)
      .run();
    return c.json({ ok: true });
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    // Links first, explicitly: D1 doesn't guarantee `PRAGMA foreign_keys`, and
    // a task_tags row pointing at a deleted tag would render as a nameless chip.
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM task_tags WHERE tag_id IN (SELECT id FROM tags WHERE id = ? AND workspace_id = ?)`
      ).bind(id, workspaceId),
      c.env.DB.prepare(`DELETE FROM tags WHERE id = ? AND workspace_id = ?`).bind(id, workspaceId),
    ]);
    return c.json({ ok: true });
  });
