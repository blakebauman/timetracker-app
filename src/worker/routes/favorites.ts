import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateFavoriteSchema } from "@shared/schemas";

// Joins in the project/task display fields so the favorites bar can render a
// colored chip without a second round-trip.
const FAVORITE_SELECT = `
  SELECT f.*, p.name AS project_name, p.color AS project_color, t.name AS task_name
  FROM favorites f
  LEFT JOIN projects p ON p.id = f.project_id
  LEFT JOIN tasks t ON t.id = f.task_id
`;

function formatFavorite(row: Record<string, unknown>) {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse((row.tags as string) || "[]");
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
  } catch {
    tags = [];
  }
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    description: (row.description as string) ?? "",
    projectId: (row.project_id as string | null) ?? null,
    projectName: (row.project_name as string | null) ?? null,
    projectColor: (row.project_color as string | null) ?? null,
    taskId: (row.task_id as string | null) ?? null,
    taskName: (row.task_name as string | null) ?? null,
    tags,
    billable: Boolean(row.billable),
    createdAt: row.created_at as string,
  };
}

export const favoritesRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { results } = await c.env.DB.prepare(
      `${FAVORITE_SELECT} WHERE f.workspace_id = ? ORDER BY f.created_at DESC`
    )
      .bind(workspaceId)
      .all<Record<string, unknown>>();

    return c.json(results.map(formatFavorite));
  })
  .post("/", zValidator("json", CreateFavoriteSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO favorites
         (id, workspace_id, description, project_id, task_id, tags, billable, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        workspaceId,
        data.description,
        data.projectId ?? null,
        data.taskId ?? null,
        JSON.stringify(data.tags),
        data.billable ? 1 : 0,
        now
      )
      .run();

    const { results } = await c.env.DB.prepare(
      `${FAVORITE_SELECT} WHERE f.id = ?`
    )
      .bind(id)
      .all<Record<string, unknown>>();

    return c.json(formatFavorite(results[0]), 201);
  })
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(
      `DELETE FROM favorites WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .run();
    return c.json({ ok: true });
  });
