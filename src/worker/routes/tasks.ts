import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateTaskSchema, UpdateTaskSchema } from "@shared/schemas";

function formatTask(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    projectId: row.project_id as string,
    projectName: (row.project_name as string | null) ?? null,
    projectColor: (row.project_color as string | null) ?? null,
    name: row.name as string,
    active: Boolean(row.active),
    estimatedSeconds: (row.estimated_seconds as number | null) ?? null,
    trackedSeconds: (row.tracked_seconds as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

const TASK_SELECT = `
  SELECT tk.*,
    p.name  AS project_name, p.color AS project_color,
    COALESCE(SUM(te.duration), 0) AS tracked_seconds
  FROM tasks tk
  LEFT JOIN projects p ON p.id = tk.project_id
  LEFT JOIN time_entries te ON te.task_id = tk.id AND te.stop IS NOT NULL
`;

export const tasksRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  // ─── List tasks for a project ─────────────────────────────────────────────
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { projectId, includeInactive } = c.req.query();

    let where = `WHERE tk.workspace_id = ?`;
    const bindings: unknown[] = [workspaceId];

    if (projectId) { where += ` AND tk.project_id = ?`; bindings.push(projectId); }
    if (!includeInactive) { where += ` AND tk.active = 1`; }

    const { results } = await c.env.DB.prepare(
      `${TASK_SELECT} ${where} GROUP BY tk.id ORDER BY tk.name ASC`
    ).bind(...bindings).all<Record<string, unknown>>();

    return c.json(results.map(formatTask));
  })
  // ─── Create ───────────────────────────────────────────────────────────────
  .post("/", zValidator("json", CreateTaskSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO tasks (id, workspace_id, project_id, name, active, estimated_seconds, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).bind(id, workspaceId, data.projectId, data.name, data.estimatedSeconds ?? null, now).run();

    const { results } = await c.env.DB.prepare(
      `${TASK_SELECT} WHERE tk.id = ? GROUP BY tk.id`
    ).bind(id).all<Record<string, unknown>>();

    return c.json(formatTask(results[0]), 201);
  })
  // ─── Update ───────────────────────────────────────────────────────────────
  .put("/:id", zValidator("json", UpdateTaskSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined)             { fields.push("name = ?");             values.push(data.name); }
    if (data.active !== undefined)           { fields.push("active = ?");           values.push(data.active ? 1 : 0); }
    if (data.estimatedSeconds !== undefined) { fields.push("estimated_seconds = ?"); values.push(data.estimatedSeconds ?? null); }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      ).bind(...values, id, workspaceId).run();
    }

    const { results } = await c.env.DB.prepare(
      `${TASK_SELECT} WHERE tk.id = ? GROUP BY tk.id`
    ).bind(id).all<Record<string, unknown>>();

    return c.json(formatTask(results[0]));
  })
  // ─── Delete ───────────────────────────────────────────────────────────────
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(
      `DELETE FROM tasks WHERE id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), c.get("workspaceId")).run();
    return c.json({ ok: true });
  });
