import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ReportQuerySchema } from "@shared/schemas";
import { buildReportWhere } from "../db/queries";

// Row-level product summed → correct even when a group spans projects with
// different rates. rate is per-hour and may be NULL.
const AMOUNT_EXPR = `SUM((CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END) * COALESCE(p.rate, 0) / 3600.0)`;
const BILLABLE_EXPR = `SUM(CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END)`;

export const reportsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/summary", zValidator("query", ReportQuerySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { since, until, projectIds, clientIds, taskIds, tagIds } =
      c.req.valid("query");
    const { where, bindings } = buildReportWhere({
      workspaceId,
      since,
      until,
      projectIds,
      clientIds,
      taskIds,
      tagIds,
    });

    // Total stats
    const { results: totals } = await c.env.DB.prepare(
      `
      SELECT
        COUNT(*) as entry_count,
        SUM(te.duration) as total_seconds,
        ${BILLABLE_EXPR} as billable_seconds,
        ${AMOUNT_EXPR} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where}
    `
    )
      .bind(...bindings)
      .all<Record<string, number>>();

    // By project
    const { results: byProject } = await c.env.DB.prepare(
      `
      SELECT
        p.id as id,
        p.name as name,
        p.color as color,
        COUNT(*) as entry_count,
        SUM(te.duration) as total_seconds,
        ${BILLABLE_EXPR} as billable_seconds,
        ${AMOUNT_EXPR} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where}
      GROUP BY te.project_id
      ORDER BY total_seconds DESC
    `
    )
      .bind(...bindings)
      .all<Record<string, unknown>>();

    // By client (client lives on the project)
    const { results: byClient } = await c.env.DB.prepare(
      `
      SELECT
        p.client_id as id,
        COALESCE(cl.name, 'No client') as name,
        COUNT(*) as entry_count,
        SUM(te.duration) as total_seconds,
        ${BILLABLE_EXPR} as billable_seconds,
        ${AMOUNT_EXPR} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE ${where}
      GROUP BY p.client_id
      ORDER BY total_seconds DESC
    `
    )
      .bind(...bindings)
      .all<Record<string, unknown>>();

    // By task
    const { results: byTask } = await c.env.DB.prepare(
      `
      SELECT
        te.task_id as id,
        COALESCE(tk.name, 'No task') as name,
        COUNT(*) as entry_count,
        SUM(te.duration) as total_seconds,
        ${BILLABLE_EXPR} as billable_seconds,
        ${AMOUNT_EXPR} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN tasks tk ON tk.id = te.task_id
      WHERE ${where}
      GROUP BY te.task_id
      ORDER BY total_seconds DESC
    `
    )
      .bind(...bindings)
      .all<Record<string, unknown>>();

    // By tag — this query DOES join tags (grouping by tag). An entry with N
    // tags contributes to N tags, so per-tag totals may sum to more than the
    // grand total. Entries with no tags collapse into a single "No tag" group.
    const { results: byTag } = await c.env.DB.prepare(
      `
      SELECT
        t.id as id,
        COALESCE(t.name, 'No tag') as name,
        COUNT(DISTINCT te.id) as entry_count,
        SUM(te.duration) as total_seconds,
        ${BILLABLE_EXPR} as billable_seconds,
        ${AMOUNT_EXPR} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
      LEFT JOIN tags t ON t.id = tet.tag_id
      WHERE ${where}
      GROUP BY t.id
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
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where}
      GROUP BY date(te.start)
      ORDER BY date ASC
    `
    )
      .bind(...bindings)
      .all<Record<string, unknown>>();

    const mapBreakdown = (
      rows: Record<string, unknown>[],
      noneLabel: string,
      defaultColor?: string
    ) =>
      rows.map((r) => ({
        id: (r.id as string | null) ?? null,
        name: (r.name as string) ?? noneLabel,
        ...(defaultColor !== undefined
          ? { color: (r.color as string) ?? defaultColor }
          : {}),
        entryCount: (r.entry_count as number) ?? 0,
        totalSeconds: (r.total_seconds as number) ?? 0,
        billableSeconds: (r.billable_seconds as number) ?? 0,
        billableAmount: (r.billable_amount as number) ?? 0,
      }));

    return c.json({
      totalSeconds: (totals[0]?.total_seconds as number) ?? 0,
      billableSeconds: (totals[0]?.billable_seconds as number) ?? 0,
      billableAmount: (totals[0]?.billable_amount as number) ?? 0,
      entryCount: (totals[0]?.entry_count as number) ?? 0,
      byProject: mapBreakdown(byProject, "No project", "#94a3b8"),
      byClient: mapBreakdown(byClient, "No client"),
      byTask: mapBreakdown(byTask, "No task"),
      byTag: mapBreakdown(byTag, "No tag"),
      daily: daily.map((r) => ({
        date: r.date as string,
        totalSeconds: r.total_seconds as number,
        entryCount: r.entry_count as number,
      })),
    });
  })
  .get(
    "/weekly",
    zValidator("query", ReportQuerySchema.partial().required({ since: true, until: true })),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { since, until, projectIds, clientIds, taskIds, tagIds } =
        c.req.valid("query");
      const { where, bindings } = buildReportWhere({
        workspaceId,
        since,
        until,
        projectIds,
        clientIds,
        taskIds,
        tagIds,
      });

      const { results } = await c.env.DB.prepare(
        `
      SELECT
        date(te.start) as date,
        strftime('%Y-W%W', te.start) as week,
        SUM(te.duration) as total_seconds,
        ${BILLABLE_EXPR} as billable_seconds,
        COUNT(*) as entry_count
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where}
      GROUP BY date(te.start)
      ORDER BY date ASC
      `
      )
        .bind(...bindings)
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
    }
  )
  .get(
    "/detailed",
    zValidator("query", ReportQuerySchema.partial().required({ since: true, until: true })),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { since, until, projectIds, clientIds, taskIds, tagIds } =
        c.req.valid("query");
      const { where, bindings } = buildReportWhere({
        workspaceId,
        since,
        until,
        projectIds,
        clientIds,
        taskIds,
        tagIds,
      });

      const { results } = await c.env.DB.prepare(
        `
      SELECT te.*,
        p.name as project_name, p.color as project_color, p.rate as project_rate,
        c.name as client_name,
        tk.name as task_name,
        GROUP_CONCAT(t.name) as tag_names
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN tasks tk ON tk.id = te.task_id
      LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
      LEFT JOIN tags t ON t.id = tet.tag_id
      WHERE ${where}
      GROUP BY te.id
      ORDER BY te.start DESC
    `
      )
        .bind(...bindings)
        .all<Record<string, unknown>>();

      return c.json(
        results.map((r) => {
          const billable = Boolean(r.billable);
          const duration = (r.duration as number | null) ?? 0;
          const rate = (r.project_rate as number | null) ?? 0;
          return {
            id: r.id,
            description: r.description ?? "",
            projectId: r.project_id ?? null,
            projectName: r.project_name ?? null,
            projectColor: r.project_color ?? null,
            clientName: r.client_name ?? null,
            taskName: r.task_name ?? null,
            start: r.start,
            stop: r.stop,
            duration,
            billable,
            amount: billable ? (duration / 3600) * rate : 0,
            tags: r.tag_names
              ? String(r.tag_names).split(",").filter(Boolean)
              : [],
          };
        })
      );
    }
  );
