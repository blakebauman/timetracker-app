import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ReportQuerySchema } from "@shared/schemas";

export const reportsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/summary", zValidator("query", ReportQuerySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { since, until, projectId } = c.req.valid("query");

    let whereClause = `te.workspace_id = ? AND te.start >= ? AND te.start < ? AND te.stop IS NOT NULL`;
    const bindings: unknown[] = [workspaceId, since, until];

    if (projectId) {
      whereClause += ` AND te.project_id = ?`;
      bindings.push(projectId);
    }

    // Total stats
    const { results: totals } = await c.env.DB.prepare(
      `
      SELECT
        COUNT(*) as entry_count,
        SUM(te.duration) as total_seconds,
        SUM(CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END) as billable_seconds
      FROM time_entries te
      WHERE ${whereClause}
    `
    )
      .bind(...bindings)
      .all<Record<string, number>>();

    // By project
    const { results: byProject } = await c.env.DB.prepare(
      `
      SELECT
        p.id as project_id,
        p.name as project_name,
        p.color as project_color,
        COUNT(*) as entry_count,
        SUM(te.duration) as total_seconds
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${whereClause}
      GROUP BY te.project_id
      ORDER BY total_seconds DESC
    `
    )
      .bind(...bindings)
      .all<Record<string, unknown>>();

    // Daily breakdown
    const { results: daily } = await c.env.DB.prepare(
      `
      SELECT
        date(te.start) as date,
        SUM(te.duration) as total_seconds,
        COUNT(*) as entry_count
      FROM time_entries te
      WHERE ${whereClause}
      GROUP BY date(te.start)
      ORDER BY date ASC
    `
    )
      .bind(...bindings)
      .all<Record<string, unknown>>();

    return c.json({
      totalSeconds: (totals[0]?.total_seconds as number) ?? 0,
      billableSeconds: (totals[0]?.billable_seconds as number) ?? 0,
      entryCount: (totals[0]?.entry_count as number) ?? 0,
      byProject: byProject.map((r) => ({
        projectId: r.project_id ?? null,
        projectName: (r.project_name as string) ?? "No project",
        projectColor: (r.project_color as string) ?? "#94a3b8",
        entryCount: r.entry_count as number,
        totalSeconds: r.total_seconds as number,
      })),
      daily: daily.map((r) => ({
        date: r.date as string,
        totalSeconds: r.total_seconds as number,
        entryCount: r.entry_count as number,
      })),
    });
  })
  .get("/weekly", zValidator("query", ReportQuerySchema.partial().required({ since: true, until: true })), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { since, until } = c.req.valid("query");

    const { results } = await c.env.DB.prepare(
      `
      SELECT
        date(te.start) as date,
        strftime('%Y-W%W', te.start) as week,
        SUM(te.duration) as total_seconds,
        SUM(CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END) as billable_seconds,
        COUNT(*) as entry_count
      FROM time_entries te
      WHERE te.workspace_id = ? AND te.start >= ? AND te.start < ? AND te.stop IS NOT NULL
      GROUP BY date(te.start)
      ORDER BY date ASC
      `
    )
      .bind(workspaceId, since, until)
      .all<Record<string, unknown>>();

    // Group by week
    const weekMap = new Map<string, { week: string; days: unknown[] }>();
    for (const r of results) {
      const week = r.week as string;
      if (!weekMap.has(week)) weekMap.set(week, { week, days: [] });
      weekMap.get(week)!.days.push({
        date: r.date as string,
        totalSeconds: (r.total_seconds as number) ?? 0,
        billableSeconds: (r.billable_seconds as number) ?? 0,
        entryCount: (r.entry_count as number) ?? 0,
      });
    }

    return c.json([...weekMap.values()]);
  })
  .get("/detailed", zValidator("query", ReportQuerySchema.partial().required({since: true, until: true})), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { since, until, projectId } = c.req.query();

    let whereClause = `te.workspace_id = ? AND te.start >= ? AND te.start < ? AND te.stop IS NOT NULL`;
    const bindings: unknown[] = [workspaceId, since, until];

    if (projectId) {
      whereClause += ` AND te.project_id = ?`;
      bindings.push(projectId);
    }

    const { results } = await c.env.DB.prepare(
      `
      SELECT te.*,
        p.name as project_name, p.color as project_color,
        c.name as client_name,
        GROUP_CONCAT(t.name) as tag_names
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
      LEFT JOIN tags t ON t.id = tet.tag_id
      WHERE ${whereClause}
      GROUP BY te.id
      ORDER BY te.start DESC
    `
    )
      .bind(...bindings)
      .all<Record<string, unknown>>();

    return c.json(
      results.map((r) => ({
        id: r.id,
        description: r.description ?? "",
        projectId: r.project_id ?? null,
        projectName: r.project_name ?? null,
        projectColor: r.project_color ?? null,
        clientName: r.client_name ?? null,
        start: r.start,
        stop: r.stop,
        duration: r.duration,
        billable: Boolean(r.billable),
        tags: r.tag_names
          ? String(r.tag_names).split(",").filter(Boolean)
          : [],
      }))
    );
  });
