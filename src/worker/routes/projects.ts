import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateProjectSchema, UpdateProjectSchema } from "@shared/schemas";

function formatProject(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    clientId: (row.client_id as string | null) ?? null,
    clientName: (row.client_name as string | null) ?? null,
    name: row.name as string,
    color: row.color as string,
    billable: Boolean(row.billable),
    rate: (row.rate as number | null) ?? null,
    active: Boolean(row.active),
    createdAt: row.created_at as string,
  };
}

export const projectsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { includeArchived } = c.req.query();

    const { results } = await c.env.DB.prepare(
      `
      SELECT p.*, c.name as client_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.workspace_id = ?
        ${!includeArchived ? "AND p.active = 1" : ""}
      ORDER BY p.name ASC
    `
    )
      .bind(workspaceId)
      .all<Record<string, unknown>>();

    return c.json(results.map(formatProject));
  })
  .post("/", zValidator("json", CreateProjectSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `
      INSERT INTO projects (id, workspace_id, client_id, name, color, billable, rate, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `
    )
      .bind(
        id,
        workspaceId,
        data.clientId ?? null,
        data.name,
        data.color,
        data.billable ? 1 : 0,
        data.rate ?? null,
        now
      )
      .run();

    const { results } = await c.env.DB.prepare(
      `
      SELECT p.*, c.name as client_name
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.id = ?
    `
    )
      .bind(id)
      .all<Record<string, unknown>>();

    return c.json(formatProject(results[0]), 201);
  })
  .get("/:id", async (c) => {
    const { results } = await c.env.DB.prepare(
      `
      SELECT p.*, c.name as client_name
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.id = ? AND p.workspace_id = ?
    `
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatProject(results[0]));
  })
  .put("/:id", zValidator("json", UpdateProjectSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.color !== undefined) { fields.push("color = ?"); values.push(data.color); }
    if (data.clientId !== undefined) { fields.push("client_id = ?"); values.push(data.clientId ?? null); }
    if (data.billable !== undefined) { fields.push("billable = ?"); values.push(data.billable ? 1 : 0); }
    if (data.rate !== undefined) { fields.push("rate = ?"); values.push(data.rate ?? null); }
    if (data.active !== undefined) { fields.push("active = ?"); values.push(data.active ? 1 : 0); }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE projects SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      )
        .bind(...values, id, workspaceId)
        .run();
    }

    const { results } = await c.env.DB.prepare(
      `SELECT p.*, c.name as client_name FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?`
    )
      .bind(id)
      .all<Record<string, unknown>>();

    return c.json(formatProject(results[0]));
  })
  .delete("/:id", async (c) => {
    // Soft-delete: archive instead of destroy
    await c.env.DB.prepare(
      `UPDATE projects SET active = 0 WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .run();
    return c.json({ ok: true });
  });
