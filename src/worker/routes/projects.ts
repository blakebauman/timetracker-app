import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateProjectSchema, UpdateProjectSchema } from "@shared/schemas";
import { DISTINCT_COLORS, spreadColor } from "../lib/colors";
import { runProjectColorAssignment } from "../lib/ai";
import { loadProjectPacing } from "../lib/pacing";

const PROJECT_SELECT = `
  SELECT p.*, c.name AS client_name,
    COALESCE(SUM(te.duration), 0) AS tracked_seconds
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
  LEFT JOIN time_entries te ON te.project_id = p.id AND te.workspace_id = p.workspace_id AND te.stop IS NOT NULL
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

    // Colour is optional: when the caller doesn't pick one, take the first
    // palette entry this workspace isn't already using, so two projects are
    // never born the same colour. DISTINCT_COLORS is hue-alternated, so even the
    // first two or three read as clearly different — which is the promise the
    // breakdown donut and the calendar blocks rely on. The old fixed schema
    // default meant every project created outside the project form (API,
    // extension, seed) came out the same sky blue.
    let color = data.color;
    if (!color) {
      const { results: used } = await c.env.DB.prepare(
        `SELECT color FROM projects WHERE workspace_id = ?`
      ).bind(workspaceId).all<{ color: string }>();
      const taken = new Set(used.map((r) => r.color));
      color =
        DISTINCT_COLORS.find((candidate) => !taken.has(candidate)) ??
        spreadColor(used.length);
    }

    await c.env.DB.prepare(
      `INSERT INTO projects
         (id, workspace_id, client_id, name, color, billable, rate, active, start_date, end_date, estimated_hours, integration_id, external_project_id, external_task_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, workspaceId,
      data.clientId ?? null,
      data.name, color,
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
      `${PROJECT_SELECT} WHERE p.id = ? AND p.workspace_id = ? GROUP BY p.id`
    ).bind(id, workspaceId).all<Record<string, unknown>>();

    return c.json(formatProject(results[0]), 201);
  })
  // Auto-assign colors: ask Workers AI to give each project a distinct, sensibly
  // grouped palette color, then enforce distinctness + fill gaps with a
  // deterministic warm/cool spread so a poor/absent AI response never regresses.
  .post("/recolor", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { results } = await c.env.DB.prepare(
      `SELECT id, name FROM projects WHERE workspace_id = ? ORDER BY name ASC`
    ).bind(workspaceId).all<{ id: string; name: string }>();

    if (!results.length) return c.json({ recolored: 0, usedAI: false });

    // AI suggestion (best-effort) keyed by exact project name.
    let aiColors = new Map<string, string>();
    let usedAI = false;
    try {
      aiColors = await runProjectColorAssignment(
        c.env.AI,
        results.map((r) => r.name)
      );
      usedAI = aiColors.size > 0;
    } catch {
      // AI unavailable / bad response — fall through to the deterministic spread.
    }

    // Assign in order: take the AI color when valid and not already used;
    // otherwise the next unused deterministic-spread color. Guarantees distinct
    // colors up to the palette size (18), then cycles.
    const used = new Set<string>();
    let spreadIdx = 0;
    const nextSpread = () => {
      // Advance to the next spread color not yet taken this run.
      for (let i = 0; i < DISTINCT_COLORS.length; i++) {
        const color = spreadColor(spreadIdx++);
        if (!used.has(color)) return color;
      }
      return spreadColor(spreadIdx++); // palette exhausted — allow reuse
    };

    const assignments = results.map((r) => {
      const ai = aiColors.get(r.name);
      const color = ai && !used.has(ai) ? ai : nextSpread();
      used.add(color);
      return { id: r.id, color };
    });

    const stmt = c.env.DB.prepare(
      `UPDATE projects SET color = ? WHERE id = ? AND workspace_id = ?`
    );
    await c.env.DB.batch(assignments.map((a) => stmt.bind(a.color, a.id, workspaceId)));

    return c.json({ recolored: assignments.length, usedAI });
  })
  // Budget pacing for every active project: share of budget spent, burn rate
  // over the trailing window, and where that rate lands the project by its end
  // date. Declared before "/:id" so the literal path isn't read as a project id.
  .get("/pacing", async (c) => {
    const pacing = await loadProjectPacing(c.env.DB, c.get("workspaceId"));
    return c.json(pacing);
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
      `${PROJECT_SELECT} WHERE p.id = ? AND p.workspace_id = ? GROUP BY p.id`
    ).bind(id, workspaceId).all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatProject(results[0]));
  })
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(
      `UPDATE projects SET active = 0 WHERE id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), c.get("workspaceId")).run();
    return c.json({ ok: true });
  });
