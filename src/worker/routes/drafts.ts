import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  GenerateDraftsSchema,
  UpdateDraftSchema,
  ConfirmDraftsSchema,
} from "@shared/schemas";
import {
  generateDrafts,
  listDrafts,
  listDraftRange,
  getDraft,
  scaleDurations,
} from "../lib/drafts";
import { broadcast } from "../db/queries";

const clientId = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header("X-Client-Id") ?? null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Drafted entries: proposals for a day the user reviews and confirms.
 *
 * Scoped to the calling user as well as the workspace — a draft describes one
 * person's day and stays invisible to their teammates until it is confirmed
 * into a real entry.
 */
export const draftsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  // ─── List drafts ──────────────────────────────────────────────────────────
  //
  // `date` for one day (what review works on), or `since`/`until` for a range
  // (what the calendar paints across a visible week). Both are LOCAL dates.
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { date, since, until } = c.req.query();

    if (date) {
      if (!DATE_RE.test(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
      return c.json(await listDrafts(c.env.DB, workspaceId, userId, date));
    }
    if (since && until) {
      if (!DATE_RE.test(since) || !DATE_RE.test(until)) {
        return c.json({ error: "since and until must be YYYY-MM-DD" }, 400);
      }
      return c.json(await listDraftRange(c.env.DB, workspaceId, userId, since, until));
    }
    return c.json({ error: "Pass date=YYYY-MM-DD, or since= and until=" }, 400);
  })
  // ─── Draft the day ────────────────────────────────────────────────────────
  .post("/generate", zValidator("json", GenerateDraftsSchema), async (c) => {
    const { date, timezoneOffsetMinutes } = c.req.valid("json");
    const result = await generateDrafts(
      c.env,
      c.get("workspaceId"),
      c.get("userId"),
      date,
      timezoneOffsetMinutes
    );
    return c.json(result);
  })
  // ─── Confirm into real entries ────────────────────────────────────────────
  //
  // The only path from a draft to tracked time. Declared before "/:id" so the
  // literal path isn't read as a draft id.
  .post("/confirm", zValidator("json", ConfirmDraftsSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { ids, reportedTotalSeconds } = c.req.valid("json");

    const placeholders = ids.map(() => "?").join(",");
    const { results } = await c.env.DB.prepare(
      `SELECT id, project_id, task_id, description, start, stop, duration, billable,
              calendar_event_id
       FROM draft_entries
       WHERE workspace_id = ? AND user_id = ? AND id IN (${placeholders})
       ORDER BY start ASC`
    )
      .bind(workspaceId, userId, ...ids)
      .all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "No matching drafts" }, 404);

    // Reconcile the day's total across the batch before anything is written, so
    // a rejected scale can't leave half the drafts confirmed at the old lengths.
    const durations = results.map((r) => (r.duration as number) ?? 0);
    const finalDurations =
      reportedTotalSeconds != null && reportedTotalSeconds > 0
        ? scaleDurations(durations, reportedTotalSeconds)
        : durations;

    const now = new Date().toISOString();
    const insert = c.env.DB.prepare(
      `INSERT INTO time_entries
         (id, workspace_id, project_id, task_id, description, start, stop, duration,
          billable, calendar_event_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const remove = c.env.DB.prepare(
      `DELETE FROM draft_entries WHERE id = ? AND workspace_id = ? AND user_id = ?`
    );

    const statements = results.flatMap((row, i) => {
      const startMs = new Date(row.start as string).getTime();
      // Scaling moves the end of the entry, never its start: when it began is
      // an observed fact, how long it ran is the estimate being corrected.
      const stop = new Date(startMs + finalDurations[i] * 1000).toISOString();
      return [
        insert.bind(
          crypto.randomUUID(),
          workspaceId,
          (row.project_id as string | null) ?? null,
          (row.task_id as string | null) ?? null,
          (row.description as string) ?? "",
          row.start as string,
          stop,
          finalDurations[i],
          row.billable ? 1 : 0,
          (row.calendar_event_id as string | null) ?? null,
          now,
          now
        ),
        remove.bind(row.id as string, workspaceId, userId),
      ];
    });

    await c.env.DB.batch(statements);

    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "entries:changed", null, clientId(c))
    );
    return c.json({
      confirmed: results.length,
      totalSeconds: finalDurations.reduce((sum, d) => sum + d, 0),
    });
  })
  // ─── Discard a whole day's drafts ─────────────────────────────────────────
  .delete("/", async (c) => {
    const date = c.req.query("date");
    if (!date || !DATE_RE.test(date)) {
      return c.json({ error: "A date=YYYY-MM-DD query parameter is required" }, 400);
    }
    const result = await c.env.DB.prepare(
      `DELETE FROM draft_entries WHERE workspace_id = ? AND user_id = ? AND local_date = ?`
    )
      .bind(c.get("workspaceId"), c.get("userId"), date)
      .run();
    return c.json({ deleted: result.meta.changes ?? 0 });
  })
  // ─── Edit a draft before confirming ───────────────────────────────────────
  .patch("/:id", zValidator("json", UpdateDraftSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const owned = await c.env.DB.prepare(
      `SELECT start, stop FROM draft_entries WHERE id = ? AND workspace_id = ? AND user_id = ?`
    )
      .bind(id, workspaceId, userId)
      .first<{ start: string; stop: string }>();
    if (!owned) return c.json({ error: "Not found" }, 404);

    // Validate the range the row will actually have after the patch — a
    // single-field edit is what every inline control sends, and the schema's
    // refine can only compare the fields present in the body.
    const nextStart = data.start ?? owned.start;
    const nextStop = data.stop ?? owned.stop;
    if (new Date(nextStop) <= new Date(nextStart)) {
      return c.json({ error: "Stop time must be after start time" }, 400);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.projectId !== undefined)   { fields.push("project_id = ?");  values.push(data.projectId ?? null); }
    if (data.taskId !== undefined)      { fields.push("task_id = ?");     values.push(data.taskId ?? null); }
    if (data.billable !== undefined)    { fields.push("billable = ?");    values.push(data.billable ? 1 : 0); }
    if (data.start !== undefined || data.stop !== undefined) {
      fields.push("start = ?", "stop = ?", "duration = ?");
      values.push(
        nextStart,
        nextStop,
        Math.round((new Date(nextStop).getTime() - new Date(nextStart).getTime()) / 1000)
      );
    }
    fields.push("updated_at = ?");
    values.push(new Date().toISOString());

    await c.env.DB.prepare(
      `UPDATE draft_entries SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ? AND user_id = ?`
    )
      .bind(...values, id, workspaceId, userId)
      .run();

    const draft = await getDraft(c.env.DB, workspaceId, userId, id);
    return c.json(draft);
  })
  // ─── Discard one draft ────────────────────────────────────────────────────
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(
      `DELETE FROM draft_entries WHERE id = ? AND workspace_id = ? AND user_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"), c.get("userId"))
      .run();
    return c.json({ ok: true });
  });
