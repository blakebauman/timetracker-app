import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  AiQuickEntryRequestSchema,
  AiSummaryRequestSchema,
  type AiQuickEntryResult,
  type AiSummaryResult,
} from "@shared/schemas";
import {
  runQuickEntryParse,
  runSummaryGeneration,
  resolveGrounding,
  AiParseError,
  type ProjectGrounding,
  type SummaryEntryInput,
} from "../lib/ai";

async function loadGroundingProjects(
  db: D1Database,
  workspaceId: string
): Promise<ProjectGrounding[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS project_id, p.name AS project_name, p.billable AS project_billable,
              tk.id AS task_id, tk.name AS task_name
       FROM projects p
       LEFT JOIN tasks tk ON tk.project_id = p.id AND tk.active = 1
       WHERE p.workspace_id = ? AND p.active = 1
       ORDER BY p.name ASC`
    )
    .bind(workspaceId)
    .all<Record<string, unknown>>();

  const byId = new Map<string, ProjectGrounding>();
  for (const row of results) {
    const id = row.project_id as string;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: row.project_name as string,
        billable: Boolean(row.project_billable),
        tasks: [],
      });
    }
    if (row.task_id) {
      byId.get(id)!.tasks.push({ id: row.task_id as string, name: row.task_name as string });
    }
  }
  return [...byId.values()];
}

export const aiRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .post("/quick-entry", zValidator("json", AiQuickEntryRequestSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { text, referenceDate, timezoneOffsetMinutes } = c.req.valid("json");

    const projects = await loadGroundingProjects(c.env.DB, workspaceId);

    let rawResult;
    try {
      rawResult = await runQuickEntryParse(
        c.env.AI,
        text,
        referenceDate,
        timezoneOffsetMinutes,
        projects
      );
    } catch (err) {
      const message = err instanceof AiParseError ? err.message : "AI is unavailable right now";
      return c.json({ error: message }, 502);
    }

    const { projectId, projectMatched, taskId, taskMatched, warnings } = resolveGrounding(
      rawResult.projectName,
      rawResult.taskName,
      projects
    );

    return c.json(
      {
        projectId,
        projectName: rawResult.projectName,
        projectMatched,
        taskId,
        taskName: rawResult.taskName,
        taskMatched,
        description: rawResult.description,
        start: rawResult.start,
        stop: rawResult.stop,
        billable: rawResult.billable,
        tags: rawResult.tags,
        confidence: rawResult.confidence,
        warnings,
      } satisfies AiQuickEntryResult,
      200
    );
  })
  .post("/summary", zValidator("json", AiSummaryRequestSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { since, until, projectId, clientId, style } = c.req.valid("json");

    let whereClause = `te.workspace_id = ? AND te.start >= ? AND te.start < ? AND te.stop IS NOT NULL`;
    const bindings: unknown[] = [workspaceId, since, until];
    if (projectId) {
      whereClause += ` AND te.project_id = ?`;
      bindings.push(projectId);
    }
    if (clientId) {
      whereClause += ` AND p.client_id = ?`;
      bindings.push(clientId);
    }

    const { results } = await c.env.DB.prepare(
      `SELECT te.description, te.start, te.duration, te.billable, p.name AS project_name
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id
       WHERE ${whereClause}
       ORDER BY te.start ASC`
    )
      .bind(...bindings)
      .all<Record<string, unknown>>();

    const entries: SummaryEntryInput[] = results.map((r) => ({
      description: (r.description as string) ?? "",
      projectName: (r.project_name as string | null) ?? null,
      start: r.start as string,
      duration: (r.duration as number | null) ?? null,
      billable: Boolean(r.billable),
    }));

    const totalSeconds = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0);

    if (entries.length === 0) {
      return c.json({ summary: "", entryCount: 0, totalSeconds: 0 } satisfies AiSummaryResult);
    }

    let summary: string;
    try {
      summary = await runSummaryGeneration(c.env.AI, entries, style);
    } catch {
      return c.json({ error: "AI is unavailable right now — try again shortly." }, 502);
    }

    return c.json({ summary, entryCount: entries.length, totalSeconds } satisfies AiSummaryResult);
  });
