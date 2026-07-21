import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  UpsertAllocationSchema,
  BulkUpsertAllocationsSchema,
  type UpsertAllocation,
} from "@shared/schemas";

// Per-user planned allocations (workspace + user scoped): planned seconds per
// project(+task) per local date. task_id is stored as '' for "no task" so the
// 5-column UNIQUE constraint supports plain ON CONFLICT upserts; the API maps
// it back to null.

const RangeQuerySchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const ALLOCATION_SELECT = `
  SELECT a.id, a.project_id, a.task_id, a.date, a.planned_seconds, a.updated_at,
         p.name AS project_name, p.color AS project_color, t.name AS task_name
  FROM project_allocations a
  LEFT JOIN projects p ON p.id = a.project_id AND p.workspace_id = a.workspace_id
  LEFT JOIN tasks t ON t.id = a.task_id AND t.workspace_id = a.workspace_id
`;

function formatAllocation(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    taskId: (row.task_id as string) === "" ? null : (row.task_id as string),
    date: row.date as string,
    plannedSeconds: row.planned_seconds as number,
    projectName: (row.project_name as string) ?? null,
    projectColor: (row.project_color as string) ?? null,
    taskName: (row.task_name as string) ?? null,
    updatedAt: row.updated_at as string,
  };
}

const UPSERT_SQL = `
  INSERT INTO project_allocations (id, workspace_id, user_id, project_id, task_id, date, planned_seconds)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(workspace_id, user_id, project_id, task_id, date)
  DO UPDATE SET planned_seconds = excluded.planned_seconds, updated_at = datetime('now')
`;

const DELETE_SQL = `
  DELETE FROM project_allocations
  WHERE workspace_id = ? AND user_id = ? AND project_id = ? AND task_id = ? AND date = ?
`;

/** Ensure every referenced project belongs to the caller's workspace. */
async function validProjectIds(
  db: D1Database,
  workspaceId: string,
  projectIds: string[]
): Promise<Set<string>> {
  const unique = [...new Set(projectIds)];
  const placeholders = unique.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT id FROM projects WHERE workspace_id = ? AND id IN (${placeholders})`)
    .bind(workspaceId, ...unique)
    .all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

export const plannerRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", zValidator("query", RangeQuerySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { since, until } = c.req.valid("query");
    // Lexical compare is correct for YYYY-MM-DD; until is exclusive.
    const { results } = await c.env.DB.prepare(
      `${ALLOCATION_SELECT}
       WHERE a.workspace_id = ? AND a.user_id = ? AND a.date >= ? AND a.date < ?
       ORDER BY a.date ASC`
    )
      .bind(workspaceId, userId, since, until)
      .all<Record<string, unknown>>();
    return c.json(results.map(formatAllocation));
  })
  // Per-cell upsert: plannedSeconds 0 clears the cell.
  .put("/", zValidator("json", UpsertAllocationSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const data = c.req.valid("json");
    const taskId = data.taskId ?? "";

    const valid = await validProjectIds(c.env.DB, workspaceId, [data.projectId]);
    if (!valid.has(data.projectId)) return c.json({ error: "Project not found" }, 404);

    if (data.plannedSeconds === 0) {
      await c.env.DB.prepare(DELETE_SQL)
        .bind(workspaceId, userId, data.projectId, taskId, data.date)
        .run();
      return c.body(null, 204);
    }

    await c.env.DB.prepare(UPSERT_SQL)
      .bind(
        crypto.randomUUID(),
        workspaceId,
        userId,
        data.projectId,
        taskId,
        data.date,
        data.plannedSeconds
      )
      .run();

    const row = await c.env.DB.prepare(
      `${ALLOCATION_SELECT}
       WHERE a.workspace_id = ? AND a.user_id = ? AND a.project_id = ? AND a.task_id = ? AND a.date = ?`
    )
      .bind(workspaceId, userId, data.projectId, taskId, data.date)
      .first<Record<string, unknown>>();
    return c.json(formatAllocation(row!));
  })
  // Bulk upsert — serves CSV import and copy-last-week in one D1 batch.
  .post("/bulk", zValidator("json", BulkUpsertAllocationsSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { allocations } = c.req.valid("json");

    const valid = await validProjectIds(
      c.env.DB,
      workspaceId,
      allocations.map((a) => a.projectId)
    );
    const invalid = allocations.find((a) => !valid.has(a.projectId));
    if (invalid) return c.json({ error: `Project not found: ${invalid.projectId}` }, 404);

    // Later rows win over earlier duplicates of the same cell — dedupe here so
    // a single batch never upserts the same UNIQUE key twice.
    const byCell = new Map<string, UpsertAllocation>();
    for (const a of allocations) {
      byCell.set(`${a.projectId}__${a.taskId ?? ""}__${a.date}`, a);
    }

    const statements = [...byCell.values()].map((a) =>
      a.plannedSeconds === 0
        ? c.env.DB.prepare(DELETE_SQL).bind(workspaceId, userId, a.projectId, a.taskId ?? "", a.date)
        : c.env.DB.prepare(UPSERT_SQL).bind(
            crypto.randomUUID(),
            workspaceId,
            userId,
            a.projectId,
            a.taskId ?? "",
            a.date,
            a.plannedSeconds
          )
    );
    await c.env.DB.batch(statements);

    const deleted = [...byCell.values()].filter((a) => a.plannedSeconds === 0).length;
    return c.json({ upserted: byCell.size - deleted, deleted });
  });
