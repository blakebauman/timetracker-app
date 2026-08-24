import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateTimeEntrySchema,
  UpdateTimeEntrySchema,
  BulkUpdateTimeEntriesSchema,
  BulkDeleteTimeEntriesSchema,
  ENTRY_LIST_LIMIT,
} from "@shared/schemas";

// Autocomplete draws on the last quarter of work — long enough to cover
// recurring monthly tasks, short enough that retired descriptions age out.
const SUGGESTION_LOOKBACK_DAYS = 90;
// Fetched once and filtered client-side, so this is the whole candidate set.
const SUGGESTION_LIMIT = 200;
import {
  broadcast,
  formatEntry,
  getEntryById,
  upsertTags,
  ENTRY_SELECT,
} from "../db/queries";

/**
 * The tab that made this request, so its own broadcast can be filtered out
 * client-side (see `broadcast`'s `origin`). Absent for the extension and any
 * non-browser caller, which simply means they get the normal fan-out.
 */
const clientId = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header("X-Client-Id") ?? null;

/**
 * Decide an entry's billable flag when the caller didn't state one.
 *
 * `billable` is the only column reports read to compute both billable seconds
 * and invoiced amount (`reports.ts`), and nothing derives it from the project at
 * read time. While `CreateTimeEntrySchema` defaulted it to `false`, every entry
 * created without an explicit flag — the timer bar, the extension, the AI
 * quick-add — landed non-billable no matter which project it was logged
 * against, so a workspace could track a full week on a billable retainer and
 * report zero revenue.
 *
 * An explicit `true`/`false` from the caller always wins; this only fills the
 * gap. A project id that doesn't resolve (deleted, or another workspace's)
 * falls back to false rather than throwing — an unbillable entry is recoverable,
 * a rejected timer start is not.
 */
async function resolveBillable(
  db: D1Database,
  workspaceId: string,
  explicit: boolean | undefined,
  projectId: string | null | undefined
): Promise<boolean> {
  if (explicit !== undefined) return explicit;
  if (!projectId) return false;
  const row = await db
    .prepare(`SELECT billable FROM projects WHERE id = ? AND workspace_id = ?`)
    .bind(projectId, workspaceId)
    .first<{ billable: number }>();
  return Boolean(row?.billable);
}

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
       GROUP BY te.id ORDER BY te.start DESC LIMIT ${ENTRY_LIST_LIMIT}`
    )
      .bind(workspaceId, since ?? defaultSince, until ?? defaultUntil)
      .all<Record<string, unknown>>();

    return c.json(results.map(formatEntry));
  })
  // ─── Description suggestions (autocomplete) ───────────────────────────────
  // Distinct past descriptions plus the project/task/billable combo each was
  // most often logged against, so selecting one refills the whole timer bar.
  // Declared before `/:id` so the literal path isn't swallowed as an entry id.
  .get("/suggestions", async (c) => {
    const workspaceId = c.get("workspaceId");
    const since = new Date(
      Date.now() - SUGGESTION_LOOKBACK_DAYS * 86_400_000
    ).toISOString();

    // `combos` counts each description × project × task × billable pairing;
    // `ranked` picks the dominant pairing per description; `totals` carries the
    // description's overall usage. A plain GROUP BY on description alone would
    // have to pick project/task arbitrarily. Tags come from the description's
    // most recent entry (`latest`/`latest_tags`) rather than its dominant
    // combo — "make it like last time" is the intuition for tag carry-over.
    const { results } = await c.env.DB.prepare(
      `WITH recent AS (
         SELECT id, description, project_id, task_id, billable, start
         FROM time_entries
         WHERE workspace_id = ?1 AND start >= ?2 AND TRIM(description) <> ''
       ),
       combos AS (
         SELECT description, project_id, task_id, billable,
                COUNT(*) AS n, MAX(start) AS combo_last
         FROM recent
         GROUP BY description, project_id, task_id, billable
       ),
       ranked AS (
         SELECT *, ROW_NUMBER() OVER (
                     PARTITION BY description ORDER BY n DESC, combo_last DESC
                   ) AS rn
         FROM combos
       ),
       totals AS (
         SELECT description, COUNT(*) AS uses, MAX(start) AS last_used
         FROM recent GROUP BY description
       ),
       latest AS (
         SELECT description, id,
                ROW_NUMBER() OVER (
                  PARTITION BY description ORDER BY start DESC
                ) AS rn
         FROM recent
       ),
       latest_tags AS (
         SELECT l.description, GROUP_CONCAT(tg.name) AS tag_names
         FROM latest l
         JOIN time_entry_tags tet ON tet.time_entry_id = l.id
         JOIN tags tg ON tg.id = tet.tag_id
         WHERE l.rn = 1
         GROUP BY l.description
       )
       SELECT t.description, t.uses, t.last_used,
              r.project_id, r.task_id, r.billable,
              p.name AS project_name, p.color AS project_color,
              tk.name AS task_name, lt.tag_names
       FROM totals t
       JOIN ranked r ON r.description = t.description AND r.rn = 1
       LEFT JOIN latest_tags lt ON lt.description = t.description
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN tasks   tk ON tk.id = r.task_id
       ORDER BY t.last_used DESC
       LIMIT ${SUGGESTION_LIMIT}`
    )
      .bind(workspaceId, since)
      .all<Record<string, unknown>>();

    return c.json(
      results.map((r) => ({
        description: r.description as string,
        projectId: (r.project_id as string) ?? null,
        projectName: (r.project_name as string) ?? null,
        projectColor: (r.project_color as string) ?? null,
        taskId: (r.task_id as string) ?? null,
        taskName: (r.task_name as string) ?? null,
        billable: Boolean(r.billable),
        tags: r.tag_names
          ? String(r.tag_names).split(",").filter(Boolean)
          : [],
        uses: Number(r.uses),
        lastUsed: r.last_used as string,
      }))
    );
  })
  // ─── Create ───────────────────────────────────────────────────────────────
  .post("/", zValidator("json", CreateTimeEntrySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const billable = await resolveBillable(c.env.DB, workspaceId, data.billable, data.projectId);

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
      billable ? 1 : 0,
      data.calendarEventId ?? null,
      now, now
    ).run();

    if (data.tags?.length) {
      await upsertTags(c.env.DB, workspaceId, id, data.tags);
    }

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, data.stop ? "entries:changed" : "timer:start", entry, clientId(c)));
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

    // Replace tags on all affected entries. `time_entry_tags` has no
    // workspace_id, so restrict the delete/insert to entries proven to belong to
    // this workspace — otherwise a caller could rewrite another workspace's tags
    // by passing foreign ids.
    if (patch.tags !== undefined) {
      const { results: ownedEntries } = await c.env.DB.prepare(
        `SELECT id FROM time_entries WHERE workspace_id = ? AND id IN (${placeholders})`
      ).bind(workspaceId, ...ids).all<{ id: string }>();
      for (const { id } of ownedEntries) {
        await c.env.DB.prepare(`DELETE FROM time_entry_tags WHERE time_entry_id = ?`).bind(id).run();
        if (patch.tags.length) {
          await upsertTags(c.env.DB, workspaceId, id, patch.tags);
        }
      }
    }

    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "entries:changed", null, clientId(c)));
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

    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "entries:changed", null, clientId(c)));
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

    // Verify the entry belongs to this workspace before touching it OR its tags.
    // `time_entry_tags` has no workspace_id column, so without this guard a
    // tags-only PUT would delete/rewrite another workspace's tag associations.
    const owned = await c.env.DB.prepare(
      `SELECT start, stop FROM time_entries WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<{ start: string; stop: string | null }>();
    if (!owned) return c.json({ error: "Not found" }, 404);

    // Validate the range the row will actually have after the patch. The schema's
    // refine can only compare fields present in the body, so a single-field patch
    // — which is what every inline edit sends — slipped past it and let the
    // duration recompute below write a negative value.
    //
    // `<` not `<=`: creating a zero-length entry is rejected by
    // CreateTimeEntrySchema, but one that already exists (a start immediately
    // followed by a stop) must stay editable — otherwise its description could
    // never be corrected.
    const nextStart = data.start ?? owned.start;
    const nextStop = data.stop !== undefined ? data.stop : owned.stop;
    if (nextStop && new Date(nextStop) < new Date(nextStart)) {
      return c.json({ error: "Stop time must be after start time" }, 400);
    }

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
    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "entries:changed", entry, clientId(c)));
    return c.json(entry);
  })
  // ─── Delete ───────────────────────────────────────────────────────────────
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    await c.env.DB.prepare(
      `DELETE FROM time_entries WHERE id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), workspaceId).run();
    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "entries:changed", null, clientId(c)));
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
      c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "timer:stop", entry, clientId(c)));
    }
    return c.json(entry);
  });
