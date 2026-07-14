import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateSavedReportSchema } from "@shared/schemas";

// Per-user saved report views (workspace + user scoped).
export const savedReportsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, config, created_at, updated_at
       FROM saved_reports
       WHERE workspace_id = ? AND user_id = ?
       ORDER BY created_at DESC`
    )
      .bind(workspaceId, userId)
      .all<Record<string, string>>();

    return c.json(
      results.map((r) => ({
        id: r.id,
        name: r.name,
        config: safeParse(r.config),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    );
  })
  .post("/", zValidator("json", CreateSavedReportSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { name, config } = c.req.valid("json");
    const id = crypto.randomUUID();

    await c.env.DB.prepare(
      `INSERT INTO saved_reports (id, workspace_id, user_id, name, config)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, workspaceId, userId, name, JSON.stringify(config))
      .run();

    const row = await c.env.DB.prepare(
      `SELECT id, name, config, created_at, updated_at FROM saved_reports WHERE id = ?`
    )
      .bind(id)
      .first<Record<string, string>>();

    return c.json(
      {
        id: row!.id,
        name: row!.name,
        config: safeParse(row!.config),
        createdAt: row!.created_at,
        updatedAt: row!.updated_at,
      },
      201
    );
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");
    await c.env.DB.prepare(
      `DELETE FROM saved_reports WHERE id = ? AND workspace_id = ? AND user_id = ?`
    )
      .bind(id, workspaceId, userId)
      .run();
    return c.body(null, 204);
  });

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
