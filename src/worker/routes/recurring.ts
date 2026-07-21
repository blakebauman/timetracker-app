import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateRecurringEntrySchema,
  UpdateRecurringEntrySchema,
} from "@shared/schemas";

const RECURRING_SELECT = `
  SELECT r.*, p.name AS project_name, p.color AS project_color, t.name AS task_name
  FROM recurring_entries r
  LEFT JOIN projects p ON p.id = r.project_id AND p.workspace_id = r.workspace_id
  LEFT JOIN tasks t ON t.id = r.task_id AND t.workspace_id = r.workspace_id
`;

function formatRecurring(row: Record<string, unknown>) {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse((row.tags as string) || "[]");
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
  } catch {
    tags = [];
  }
  const days = String(row.days_of_week ?? "")
    .split(",")
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
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
    durationSeconds: row.duration_seconds as number,
    daysOfWeek: days,
    timeUtcMinutes: row.time_utc as number,
    active: Boolean(row.active),
    lastMaterialized: (row.last_materialized as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export const recurringRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      `${RECURRING_SELECT} WHERE r.workspace_id = ? ORDER BY r.created_at DESC`
    )
      .bind(c.get("workspaceId"))
      .all<Record<string, unknown>>();
    return c.json(results.map(formatRecurring));
  })
  .post("/", zValidator("json", CreateRecurringEntrySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const d = c.req.valid("json");
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO recurring_entries
         (id, workspace_id, description, project_id, task_id, tags, billable, duration_seconds, days_of_week, time_utc, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
      .bind(
        id,
        workspaceId,
        d.description,
        d.projectId ?? null,
        d.taskId ?? null,
        JSON.stringify(d.tags),
        d.billable ? 1 : 0,
        d.durationSeconds,
        [...new Set(d.daysOfWeek)].sort((a, b) => a - b).join(","),
        d.timeUtcMinutes,
        new Date().toISOString()
      )
      .run();

    const { results } = await c.env.DB.prepare(`${RECURRING_SELECT} WHERE r.id = ? AND r.workspace_id = ?`)
      .bind(id, workspaceId)
      .all<Record<string, unknown>>();
    return c.json(formatRecurring(results[0]), 201);
  })
  .put("/:id", zValidator("json", UpdateRecurringEntrySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const d = c.req.valid("json");

    const fields: string[] = [];
    const values: unknown[] = [];
    if (d.description !== undefined) { fields.push("description = ?"); values.push(d.description); }
    if (d.projectId !== undefined) { fields.push("project_id = ?"); values.push(d.projectId ?? null); }
    if (d.taskId !== undefined) { fields.push("task_id = ?"); values.push(d.taskId ?? null); }
    if (d.tags !== undefined) { fields.push("tags = ?"); values.push(JSON.stringify(d.tags)); }
    if (d.billable !== undefined) { fields.push("billable = ?"); values.push(d.billable ? 1 : 0); }
    if (d.durationSeconds !== undefined) { fields.push("duration_seconds = ?"); values.push(d.durationSeconds); }
    if (d.daysOfWeek !== undefined) {
      fields.push("days_of_week = ?");
      values.push([...new Set(d.daysOfWeek)].sort((a, b) => a - b).join(","));
    }
    if (d.timeUtcMinutes !== undefined) { fields.push("time_utc = ?"); values.push(d.timeUtcMinutes); }
    if (d.active !== undefined) { fields.push("active = ?"); values.push(d.active ? 1 : 0); }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE recurring_entries SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      )
        .bind(...values, id, workspaceId)
        .run();
    }

    const { results } = await c.env.DB.prepare(`${RECURRING_SELECT} WHERE r.id = ? AND r.workspace_id = ?`)
      .bind(id, workspaceId)
      .all<Record<string, unknown>>();
    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatRecurring(results[0]));
  })
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(
      `DELETE FROM recurring_entries WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .run();
    return c.json({ ok: true });
  });
