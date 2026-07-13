import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateProjectSchema, UpdateProjectSchema } from "@shared/schemas";

const PROJECT_SELECT = `
  SELECT p.*, c.name AS client_name,
    COALESCE(SUM(te.duration), 0) AS tracked_seconds
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN time_entries te ON te.project_id = p.id AND te.stop IS NOT NULL
`;

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
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    estimatedHours: (row.estimated_hours as number | null) ?? null,
    integrationId: (row.integration_id as string | null) ?? null,
    externalProjectId: (row.external_project_id as string | null) ?? null,
    externalTaskId: (row.external_task_id as string | null) ?? null,
    trackedSeconds: (row.tracked_seconds as number) ?? 0,
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
      `${PROJECT_SELECT}
       WHERE p.workspace_id = ? ${!includeArchived ? "AND p.active = 1" : ""}
       GROUP BY p.id ORDER BY p.name ASC`
    ).bind(workspaceId).all<Record<string, unknown>>();

    return c.json(results.map(formatProject));
  })
  .post("/", zValidator("json", CreateProjectSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO projects
         (id, workspace_id, client_id, name, color, billable, rate, active, start_date, end_date, estimated_hours, integration_id, external_project_id, external_task_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, workspaceId,
      data.clientId ?? null,
      data.name, data.color,
      data.billable ? 1 : 0,
      data.rate ?? null,
      data.startDate ?? null,
      data.endDate ?? null,
      data.estimatedHours ?? null,
      data.integrationId ?? null,
      data.externalProjectId ?? null,
      data.externalTaskId ?? null,
      now
    ).run();

    const { results } = await c.env.DB.prepare(
      `${PROJECT_SELECT} WHERE p.id = ? GROUP BY p.id`
    ).bind(id).all<Record<string, unknown>>();

    return c.json(formatProject(results[0]), 201);
  })
  .get("/:id", async (c) => {
    const { results } = await c.env.DB.prepare(
      `${PROJECT_SELECT} WHERE p.id = ? AND p.workspace_id = ? GROUP BY p.id`
    ).bind(c.req.param("id"), c.get("workspaceId")).all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatProject(results[0]));
  })
  .put("/:id", zValidator("json", UpdateProjectSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined)           { fields.push("name = ?");           values.push(data.name); }
    if (data.color !== undefined)          { fields.push("color = ?");          values.push(data.color); }
    if (data.clientId !== undefined)       { fields.push("client_id = ?");      values.push(data.clientId ?? null); }
    if (data.billable !== undefined)       { fields.push("billable = ?");       values.push(data.billable ? 1 : 0); }
    if (data.rate !== undefined)           { fields.push("rate = ?");           values.push(data.rate ?? null); }
    if (data.active !== undefined)         { fields.push("active = ?");         values.push(data.active ? 1 : 0); }
    if (data.startDate !== undefined)      { fields.push("start_date = ?");     values.push(data.startDate ?? null); }
    if (data.endDate !== undefined)        { fields.push("end_date = ?");       values.push(data.endDate ?? null); }
    if (data.estimatedHours !== undefined) { fields.push("estimated_hours = ?"); values.push(data.estimatedHours ?? null); }
    if (data.integrationId !== undefined)     { fields.push("integration_id = ?");      values.push(data.integrationId ?? null); }
    if (data.externalProjectId !== undefined) { fields.push("external_project_id = ?");  values.push(data.externalProjectId ?? null); }
    if (data.externalTaskId !== undefined)    { fields.push("external_task_id = ?");     values.push(data.externalTaskId ?? null); }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE projects SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      ).bind(...values, id, workspaceId).run();
    }

    const { results } = await c.env.DB.prepare(
      `${PROJECT_SELECT} WHERE p.id = ? GROUP BY p.id`
    ).bind(id).all<Record<string, unknown>>();

    return c.json(formatProject(results[0]));
  })
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(
      `UPDATE projects SET active = 0 WHERE id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), c.get("workspaceId")).run();
    return c.json({ ok: true });
  });
