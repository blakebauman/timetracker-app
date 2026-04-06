import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateTimeEntrySchema, UpdateTimeEntrySchema } from "@shared/schemas";
import {
  broadcast,
  formatEntry,
  getEntryById,
  upsertTags,
} from "../db/queries";

export const timeEntriesRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { since, until } = c.req.query();

    const now = new Date();
    const defaultSince = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 30
    ).toISOString();
    const defaultUntil = new Date(now.getTime() + 86_400_000).toISOString();

    const { results } = await c.env.DB.prepare(
      `
      SELECT te.*,
        p.name as project_name, p.color as project_color,
        GROUP_CONCAT(t.name) as tag_names
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
      LEFT JOIN tags t ON t.id = tet.tag_id
      WHERE te.workspace_id = ?
        AND te.start >= ? AND te.start < ?
      GROUP BY te.id
      ORDER BY te.start DESC
      LIMIT 500
    `
    )
      .bind(workspaceId, since ?? defaultSince, until ?? defaultUntil)
      .all<Record<string, unknown>>();

    return c.json(results.map(formatEntry));
  })
  .post("/", zValidator("json", CreateTimeEntrySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Stop any running entry before starting a new one
    if (!data.stop) {
      await c.env.DB.prepare(
        `
        UPDATE time_entries
        SET stop = ?,
            duration = CAST((julianday(?) - julianday(start)) * 86400 AS INTEGER),
            updated_at = ?
        WHERE workspace_id = ? AND stop IS NULL
      `
      )
        .bind(data.start, data.start, now, workspaceId)
        .run();
    }

    await c.env.DB.prepare(
      `
      INSERT INTO time_entries
        (id, workspace_id, project_id, description, start, stop, duration, billable, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
      .bind(
        id,
        workspaceId,
        data.projectId ?? null,
        data.description,
        data.start,
        data.stop ?? null,
        data.stop
          ? Math.round(
              (new Date(data.stop).getTime() -
                new Date(data.start).getTime()) /
                1000
            )
          : null,
        data.billable ? 1 : 0,
        now,
        now
      )
      .run();

    if (data.tags?.length) {
      await upsertTags(c.env.DB, workspaceId, id, data.tags);
    }

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    await broadcast(
      c.env,
      workspaceId,
      data.stop ? "entries:changed" : "timer:start",
      entry
    );

    return c.json(entry, 201);
  })
  .get("/current", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { results } = await c.env.DB.prepare(
      `
      SELECT te.*,
        p.name as project_name, p.color as project_color,
        GROUP_CONCAT(t.name) as tag_names
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
      LEFT JOIN tags t ON t.id = tet.tag_id
      WHERE te.workspace_id = ? AND te.stop IS NULL
      GROUP BY te.id
      ORDER BY te.start DESC
      LIMIT 1
    `
    )
      .bind(workspaceId)
      .all<Record<string, unknown>>();

    if (!results.length) return c.json(null);
    return c.json(formatEntry(results[0]));
  })
  .get("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const entry = await getEntryById(
      c.env.DB,
      c.req.param("id"),
      workspaceId
    );
    if (!entry) return c.json({ error: "Not found" }, 404);
    return c.json(entry);
  })
  .put("/:id", zValidator("json", UpdateTimeEntrySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const now = new Date().toISOString();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.description !== undefined) {
      fields.push("description = ?");
      values.push(data.description);
    }
    if (data.projectId !== undefined) {
      fields.push("project_id = ?");
      values.push(data.projectId ?? null);
    }
    if (data.start !== undefined) {
      fields.push("start = ?");
      values.push(data.start);
    }
    if (data.stop !== undefined) {
      fields.push("stop = ?");
      values.push(data.stop ?? null);
    }
    if (data.billable !== undefined) {
      fields.push("billable = ?");
      values.push(data.billable ? 1 : 0);
    }
    fields.push("updated_at = ?");
    values.push(now);

    if (fields.length > 1) {
      await c.env.DB.prepare(
        `UPDATE time_entries SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      )
        .bind(...values, id, workspaceId)
        .run();
    }

    if (data.tags !== undefined) {
      await c.env.DB.prepare(
        `DELETE FROM time_entry_tags WHERE time_entry_id = ?`
      )
        .bind(id)
        .run();
      if (data.tags.length) {
        await upsertTags(c.env.DB, workspaceId, id, data.tags);
      }
    }

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    await broadcast(c.env, workspaceId, "entries:changed", entry);
    return c.json(entry);
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    await c.env.DB.prepare(
      `DELETE FROM time_entries WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), workspaceId)
      .run();
    await broadcast(c.env, workspaceId, "entries:changed", null);
    return c.json({ ok: true });
  })
  .patch("/:id/stop", async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const stop = new Date().toISOString();

    await c.env.DB.prepare(
      `
      UPDATE time_entries
      SET stop = ?,
          duration = CAST((julianday(?) - julianday(start)) * 86400 AS INTEGER),
          updated_at = ?
      WHERE id = ? AND workspace_id = ? AND stop IS NULL
    `
    )
      .bind(stop, stop, stop, id, workspaceId)
      .run();

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    await broadcast(c.env, workspaceId, "timer:stop", entry);
    return c.json(entry);
  });
