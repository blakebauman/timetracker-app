import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateClientSchema, UpdateClientSchema } from "@shared/schemas";

function formatClient(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    archived: Boolean(row.archived),
    createdAt: row.created_at as string,
  };
}

export const clientsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { includeArchived } = c.req.query();

    const { results } = await c.env.DB.prepare(
      `
      SELECT * FROM clients
      WHERE workspace_id = ?
        ${!includeArchived ? "AND archived = 0" : ""}
      ORDER BY name ASC
    `
    )
      .bind(workspaceId)
      .all<Record<string, unknown>>();

    return c.json(results.map(formatClient));
  })
  .post("/", zValidator("json", CreateClientSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO clients (id, workspace_id, name, archived, created_at) VALUES (?, ?, ?, 0, ?)`
    )
      .bind(id, workspaceId, data.name, now)
      .run();

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM clients WHERE id = ?`
    )
      .bind(id)
      .all<Record<string, unknown>>();

    return c.json(formatClient(results[0]), 201);
  })
  .get("/:id", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM clients WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatClient(results[0]));
  })
  .put("/:id", zValidator("json", UpdateClientSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.archived !== undefined) { fields.push("archived = ?"); values.push(data.archived ? 1 : 0); }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE clients SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      )
        .bind(...values, id, workspaceId)
        .run();
    }

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM clients WHERE id = ?`
    )
      .bind(id)
      .all<Record<string, unknown>>();

    return c.json(formatClient(results[0]));
  })
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(
      `UPDATE clients SET archived = 1 WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .run();
    return c.json({ ok: true });
  });
