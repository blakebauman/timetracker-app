import { Hono } from "hono";
import { zValidator } from "../lib/validate";
import { CreateTaskViewSchema, TaskViewConfigSchema } from "@timetracker/core/schemas";

type Row = Record<string, string>;

function format(row: Row) {
  // Parse through the schema, so a view saved before a filter existed comes
  // back with that filter's default instead of `undefined`.
  let config;
  try {
    config = TaskViewConfigSchema.parse(JSON.parse(row.config));
  } catch {
    config = TaskViewConfigSchema.parse({});
  }
  return { id: row.id, name: row.name, config, createdAt: row.created_at };
}

// Per-user saved views of the task list (workspace + user scoped), the same
// shape as saved reports.
export const taskViewsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, config, created_at FROM saved_task_views
       WHERE workspace_id = ? AND user_id = ? ORDER BY name COLLATE NOCASE ASC`
    )
      .bind(c.get("workspaceId"), c.get("userId"))
      .all<Row>();
    return c.json(results.map(format));
  })
  .post("/", zValidator("json", CreateTaskViewSchema), async (c) => {
    const { name, config } = c.req.valid("json");
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO saved_task_views (id, workspace_id, user_id, name, config) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, c.get("workspaceId"), c.get("userId"), name, JSON.stringify(config))
      .run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, config, created_at FROM saved_task_views WHERE id = ?`
    )
      .bind(id)
      .first<Row>();
    return c.json(format(row!), 201);
  })
  .delete("/:id", async (c) => {
    const res = await c.env.DB.prepare(
      `DELETE FROM saved_task_views WHERE id = ? AND workspace_id = ? AND user_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"), c.get("userId"))
      .run();
    if (!res.meta.changes) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  });
