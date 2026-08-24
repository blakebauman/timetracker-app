import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { CreateClientSchema, UpdateClientSchema } from "@shared/schemas";
import { buildReportWhere } from "../db/queries";

function formatClient(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    notes: (row.notes as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
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
      `INSERT INTO clients (id, workspace_id, name, notes, email, phone, address, archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
      .bind(
        id,
        workspaceId,
        data.name,
        data.notes ?? null,
        data.email ?? null,
        data.phone ?? null,
        data.address ?? null,
        now
      )
      .run();

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM clients WHERE id = ? AND workspace_id = ?`
    )
      .bind(id, workspaceId)
      .all<Record<string, unknown>>();

    return c.json(formatClient(results[0]), 201);
  })
  /**
   * Per-client totals for a date window — what the Clients page shows instead
   * of a name and a chevron.
   *
   * Deliberately the same aggregation the reports `byClient` breakdown uses
   * (shared `buildReportWhere`, the same billable/amount expressions), so the
   * two screens can never disagree about what a client is worth. Amount is a
   * row-level product summed rather than hours × one rate, which is what keeps
   * it correct across projects on different rates.
   *
   * Rounding is deliberately NOT applied: rounding is a reporting preference
   * that belongs to an invoice you are about to send, and silently applying it
   * to a browsing surface would make this page disagree with the entry list.
   */
  .get(
    "/stats",
    zValidator("query", z.object({ since: z.string(), until: z.string() })),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { since, until } = c.req.valid("query");
      const { where, bindings } = buildReportWhere({ workspaceId, since, until });

      const { results } = await c.env.DB.prepare(
        `
      SELECT
        p.client_id                                   AS client_id,
        SUM(te.duration)                              AS total_seconds,
        SUM(CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END) AS billable_seconds,
        SUM((CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END)
            * COALESCE(p.rate, 0) / 3600.0)           AS billable_amount,
        COUNT(DISTINCT te.project_id)                 AS project_count,
        MAX(te.start)                                 AS last_tracked
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where} AND p.client_id IS NOT NULL
      GROUP BY p.client_id
    `
      )
        .bind(...bindings)
        .all<Record<string, unknown>>();

      return c.json(
        results.map((r) => ({
          clientId: r.client_id as string,
          totalSeconds: (r.total_seconds as number) ?? 0,
          billableSeconds: (r.billable_seconds as number) ?? 0,
          billableAmount: (r.billable_amount as number) ?? 0,
          projectCount: (r.project_count as number) ?? 0,
          lastTracked: (r.last_tracked as string | null) ?? null,
        }))
      );
    }
  )
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
    if (data.notes !== undefined) { fields.push("notes = ?"); values.push(data.notes ?? null); }
    if (data.email !== undefined) { fields.push("email = ?"); values.push(data.email ?? null); }
    if (data.phone !== undefined) { fields.push("phone = ?"); values.push(data.phone ?? null); }
    if (data.address !== undefined) { fields.push("address = ?"); values.push(data.address ?? null); }
    if (data.archived !== undefined) { fields.push("archived = ?"); values.push(data.archived ? 1 : 0); }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE clients SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      )
        .bind(...values, id, workspaceId)
        .run();
    }

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM clients WHERE id = ? AND workspace_id = ?`
    )
      .bind(id, workspaceId)
      .all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
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
