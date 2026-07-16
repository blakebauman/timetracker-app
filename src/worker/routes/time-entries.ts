import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateTimeEntrySchema,
  UpdateTimeEntrySchema,
  BulkUpdateTimeEntriesSchema,
  BulkDeleteTimeEntriesSchema,
} from "@shared/schemas";
import {
  broadcast,
  formatEntry,
  getEntryById,
  upsertTags,
  ENTRY_SELECT,
} from "../db/queries";

export const timeEntriesRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  // ─── List ─────────────────────────────────────────────────────────────────
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { since, until, running } = c.req.query();

    // ?running=true — return only the currently running entry
    if (running === "true") {
      const { results } = await c.env.DB.prepare(
        `${ENTRY_SELECT} WHERE te.workspace_id = ? AND te.stop IS NULL GROUP BY te.id LIMIT 1`
      ).bind(workspaceId).all<Record<string, unknown>>();
      return c.json(results.map(formatEntry));
    }

    const now = new Date();
    const defaultSince = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() - 30
    ).toISOString();
    const defaultUntil = new Date(now.getTime() + 86_400_000).toISOString();

    const { results } = await c.env.DB.prepare(
      `${ENTRY_SELECT}
       WHERE te.workspace_id = ? AND te.start >= ? AND te.start < ?
       GROUP BY te.id ORDER BY te.start DESC LIMIT 500`
    )
      .bind(workspaceId, since ?? defaultSince, until ?? defaultUntil)
      .all<Record<string, unknown>>();

    return c.json(results.map(formatEntry));
  })
  // ─── Create ───────────────────────────────────────────────────────────────
  .post("/", zValidator("json", CreateTimeEntrySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Stop any running entry
    if (!data.stop) {
      await c.env.DB.prepare(
        `UPDATE time_entries
         SET stop = ?, duration = CAST((julianday(?) - julianday(start)) * 86400 + 0.5 AS INTEGER), updated_at = ?
         WHERE workspace_id = ? AND stop IS NULL`
      ).bind(data.start, data.start, now, workspaceId).run();
    }

    await c.env.DB.prepare(
      `INSERT INTO time_entries
         (id, workspace_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, workspaceId,
      data.projectId ?? null,
      data.taskId ?? null,
      data.description,
      data.start,
      data.stop ?? null,
      data.stop
        ? Math.round((new Date(data.stop).getTime() - new Date(data.start).getTime()) / 1000)
        : null,
      data.billable ? 1 : 0,
      data.calendarEventId ?? null,
      now, now
    ).run();

    if (data.tags?.length) {
      await upsertTags(c.env.DB, workspaceId, id, data.tags);
    }

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    await broadcast(c.env, workspaceId, data.stop ? "entries:changed" : "timer:start", entry);
    return c.json(entry, 201);
  })
  // ─── Current running entry ─────────────────────────────────────────────
  .get("/current", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { results } = await c.env.DB.prepare(
      `${ENTRY_SELECT} WHERE te.workspace_id = ? AND te.stop IS NULL GROUP BY te.id ORDER BY te.start DESC LIMIT 1`
    ).bind(workspaceId).all<Record<string, unknown>>();

    if (!results.length) return c.json(null);
    return c.json(formatEntry(results[0]));
  })
  // ─── Bulk update ──────────────────────────────────────────────────────────
  .patch("/bulk", zValidator("json", BulkUpdateTimeEntriesSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { ids, patch } = c.req.valid("json");
    const now = new Date().toISOString();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (patch.description !== undefined) { fields.push("description = ?"); values.push(patch.description); }
    if (patch.projectId !== undefined)   { fields.push("project_id = ?");   values.push(patch.projectId ?? null); }
    if (patch.taskId !== undefined)      { fields.push("task_id = ?");      values.push(patch.taskId ?? null); }
    if (patch.billable !== undefined)    { fields.push("billable = ?");     values.push(patch.billable ? 1 : 0); }
    fields.push("updated_at = ?");
    values.push(now);

    const placeholders = ids.map(() => "?").join(",");
    if (fields.length > 1) {
      await c.env.DB.prepare(
        `UPDATE time_entries SET ${fields.join(", ")} WHERE workspace_id = ? AND id IN (${placeholders})`
      ).bind(...values, workspaceId, ...ids).run();
    }

    // Replace tags on all affected entries
    if (patch.tags !== undefined) {
      for (const id of ids) {
        await c.env.DB.prepare(`DELETE FROM time_entry_tags WHERE time_entry_id = ?`).bind(id).run();
        if (patch.tags.length) {
          await upsertTags(c.env.DB, workspaceId, id, patch.tags);
        }
      }
    }

    await broadcast(c.env, workspaceId, "entries:changed", null);
    return c.json({ ok: true, updated: ids.length });
  })
  // ─── Bulk delete ──────────────────────────────────────────────────────────
  .delete("/bulk", zValidator("json", BulkDeleteTimeEntriesSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { ids } = c.req.valid("json");
    const placeholders = ids.map(() => "?").join(",");

    await c.env.DB.prepare(
      `DELETE FROM time_entries WHERE workspace_id = ? AND id IN (${placeholders})`
    ).bind(workspaceId, ...ids).run();

    await broadcast(c.env, workspaceId, "entries:changed", null);
    return c.json({ ok: true, deleted: ids.length });
  })
  // ─── Get by ID ────────────────────────────────────────────────────────────
  .get("/:id", async (c) => {
    const entry = await getEntryById(c.env.DB, c.req.param("id"), c.get("workspaceId"));
    if (!entry) return c.json({ error: "Not found" }, 404);
    return c.json(entry);
  })
  // ─── Update ───────────────────────────────────────────────────────────────
  .put("/:id", zValidator("json", UpdateTimeEntrySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const now = new Date().toISOString();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.projectId !== undefined)   { fields.push("project_id = ?");   values.push(data.projectId ?? null); }
    if (data.taskId !== undefined)      { fields.push("task_id = ?");      values.push(data.taskId ?? null); }
    if (data.start !== undefined)       { fields.push("start = ?");        values.push(data.start); }
    if (data.stop !== undefined)        { fields.push("stop = ?");         values.push(data.stop ?? null); }
    if (data.billable !== undefined)    { fields.push("billable = ?");     values.push(data.billable ? 1 : 0); }
    // Recalculate duration whenever start or stop changes
    if (data.start !== undefined || data.stop !== undefined) {
      fields.push("duration = CAST((julianday(COALESCE(?, stop)) - julianday(COALESCE(?, start))) * 86400 + 0.5 AS INTEGER)");
      values.push(data.stop ?? null, data.start ?? null);
    }
    fields.push("updated_at = ?");
    values.push(now);

    if (fields.length > 1) {
      await c.env.DB.prepare(
        `UPDATE time_entries SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      ).bind(...values, id, workspaceId).run();
    }

    if (data.tags !== undefined) {
      await c.env.DB.prepare(`DELETE FROM time_entry_tags WHERE time_entry_id = ?`).bind(id).run();
      if (data.tags.length) await upsertTags(c.env.DB, workspaceId, id, data.tags);
    }

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    await broadcast(c.env, workspaceId, "entries:changed", entry);
    return c.json(entry);
  })
  // ─── Delete ───────────────────────────────────────────────────────────────
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    await c.env.DB.prepare(
      `DELETE FROM time_entries WHERE id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), workspaceId).run();
    await broadcast(c.env, workspaceId, "entries:changed", null);
    return c.json({ ok: true });
  })
  // ─── Stop running ─────────────────────────────────────────────────────────
  .patch("/:id/stop", async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const stop = new Date().toISOString();

    const result = await c.env.DB.prepare(
      `UPDATE time_entries
       SET stop = ?, duration = CAST((julianday(?) - julianday(start)) * 86400 + 0.5 AS INTEGER), updated_at = ?
       WHERE id = ? AND workspace_id = ? AND stop IS NULL`
    ).bind(stop, stop, stop, id, workspaceId).run();

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    // Only broadcast if the entry was actually running — prevents false timer:stop
    // events when the extension tries to stop an already-stopped (stale) entry
    if (result.meta.changes > 0) {
      await broadcast(c.env, workspaceId, "timer:stop", entry);
    }
    return c.json(entry);
  });
