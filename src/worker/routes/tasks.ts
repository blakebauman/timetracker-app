import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateTaskSchema, UpdateTaskSchema } from "@shared/schemas";
import { nextOccurrence, normalizeRecurRule } from "@shared/task-recurrence";

type Row = Record<string, unknown>;

function formatTask(row: Row) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    projectId: row.project_id as string,
    projectName: (row.project_name as string | null) ?? null,
    projectColor: (row.project_color as string | null) ?? null,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    active: Boolean(row.active),
    estimatedSeconds: (row.estimated_seconds as number | null) ?? null,
    trackedSeconds: (row.tracked_seconds as number) ?? 0,
    dueDate: (row.due_date as string | null) ?? null,
    priority: (row.priority as number | null) ?? 4,
    sortOrder: (row.sort_order as number | null) ?? 0,
    parentId: (row.parent_id as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    recurRule: (row.recur_rule as string | null) ?? null,
    subtaskTotal: (row.subtask_total as number) ?? 0,
    subtaskDone: (row.subtask_done as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

/**
 * `tracked_seconds` **includes every subtask's tracked time**.
 *
 * A parent is a container: time is logged against the leaf you actually worked
 * on, so without the rollup a parent with five tracked children reads as zero
 * and its estimate bar sits empty all sprint. Correlated subqueries rather than
 * a GROUP BY, so the row survives adding more per-task aggregates without
 * every one of them needing a grouping key.
 */
const TASK_SELECT = `
  SELECT tk.*,
    p.name AS project_name, p.color AS project_color,
    (SELECT COALESCE(SUM(te.duration), 0) FROM time_entries te
       WHERE te.workspace_id = tk.workspace_id AND te.stop IS NOT NULL
         AND (te.task_id = tk.id
              OR te.task_id IN (SELECT c.id FROM tasks c WHERE c.parent_id = tk.id))
    ) AS tracked_seconds,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = tk.id) AS subtask_total,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = tk.id AND c.active = 0) AS subtask_done
  FROM tasks tk
  LEFT JOIN projects p ON p.id = tk.project_id AND p.workspace_id = tk.workspace_id
`;

async function readTask(db: D1Database, id: string, workspaceId: string) {
  const { results } = await db
    .prepare(`${TASK_SELECT} WHERE tk.id = ? AND tk.workspace_id = ?`)
    .bind(id, workspaceId)
    .all<Row>();
  return results.length ? results[0] : null;
}

/**
 * Resolve a requested parent to a real, same-workspace, **top-level** task.
 *
 * One level only. Nesting past that turns a task list into a file tree, and time
 * tracked against a fourth-level leaf can't be reported against anything a
 * client would recognise. Returns `undefined` when the parent is unusable, which
 * the callers turn into a 400 rather than silently flattening.
 */
async function resolveParent(
  db: D1Database,
  parentId: string,
  workspaceId: string
): Promise<{ id: string; projectId: string } | undefined> {
  const row = await db
    .prepare(`SELECT id, project_id, parent_id FROM tasks WHERE id = ? AND workspace_id = ?`)
    .bind(parentId, workspaceId)
    .first<Row>();
  if (!row || row.parent_id) return undefined;
  return { id: row.id as string, projectId: row.project_id as string };
}

/** Next free sort key within a project, so a new task lands at the end. */
async function nextSortOrder(db: D1Database, workspaceId: string, projectId: string) {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks WHERE workspace_id = ? AND project_id = ?`)
    .bind(workspaceId, projectId)
    .first<Row>();
  return ((row?.m as number) ?? 0) + 1;
}

export const tasksRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  // ─── List tasks ───────────────────────────────────────────────────────────
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { projectId, includeInactive } = c.req.query();

    let where = `WHERE tk.workspace_id = ?`;
    const bindings: unknown[] = [workspaceId];

    if (projectId) { where += ` AND tk.project_id = ?`; bindings.push(projectId); }
    if (!includeInactive) { where += ` AND tk.active = 1`; }

    // Ordered so a client that renders the list as-is still gets a sane order:
    // the manual sequence first, then name as the stable tiebreak.
    const { results } = await c.env.DB.prepare(
      `${TASK_SELECT} ${where} ORDER BY tk.sort_order ASC, tk.name ASC`
    ).bind(...bindings).all<Row>();

    return c.json(results.map(formatTask));
  })
  // ─── Create ───────────────────────────────────────────────────────────────
  .post("/", zValidator("json", CreateTaskSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let parentId: string | null = null;
    let projectId = data.projectId;
    if (data.parentId) {
      const parent = await resolveParent(c.env.DB, data.parentId, workspaceId);
      if (!parent) {
        return c.json({ error: "Parent task not found, or is itself a subtask" }, 400);
      }
      parentId = parent.id;
      // A subtask always belongs to its parent's project — the row inherits the
      // project badge, so letting the two diverge would render a lie.
      projectId = parent.projectId;
    }

    // Recurrence lives on the thing you actually schedule. A repeating subtask
    // would spawn siblings inside a parent that never repeats.
    const recurRule = parentId ? null : normalizeRecurRule(data.recurRule);

    await c.env.DB.prepare(
      `INSERT INTO tasks
         (id, workspace_id, project_id, name, description, active, estimated_seconds,
          due_date, priority, sort_order, parent_id, recur_rule, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      workspaceId,
      projectId,
      data.name,
      data.description ?? null,
      data.estimatedSeconds ?? null,
      data.dueDate ?? null,
      data.priority ?? 4,
      await nextSortOrder(c.env.DB, workspaceId, projectId),
      parentId,
      recurRule,
      now
    ).run();

    const row = await readTask(c.env.DB, id, workspaceId);
    return c.json(formatTask(row!), 201);
  })
  // ─── Update ───────────────────────────────────────────────────────────────
  .put("/:id", zValidator("json", UpdateTaskSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const existing = await c.env.DB.prepare(
      `SELECT * FROM tasks WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<Row>();
    if (!existing) return c.json({ error: "Not found" }, 404);

    const isSubtask = Boolean(existing.parent_id);
    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, value: unknown) => { fields.push(`${col} = ?`); values.push(value); };

    if (data.name !== undefined)             set("name", data.name);
    if (data.description !== undefined)      set("description", data.description ?? null);
    if (data.estimatedSeconds !== undefined) set("estimated_seconds", data.estimatedSeconds ?? null);
    if (data.dueDate !== undefined)          set("due_date", data.dueDate ?? null);
    if (data.priority !== undefined)         set("priority", data.priority);
    if (data.sortOrder !== undefined)        set("sort_order", data.sortOrder);
    if (data.recurRule !== undefined && !isSubtask) {
      set("recur_rule", data.recurRule === null ? null : normalizeRecurRule(data.recurRule));
    }

    if (data.parentId !== undefined) {
      if (data.parentId === null) {
        set("parent_id", null);
      } else {
        const parent = await resolveParent(c.env.DB, data.parentId, workspaceId);
        // Its own child can't become its parent, and neither can it.
        if (!parent || parent.id === id || (existing.subtask_total as number) > 0) {
          return c.json({ error: "Parent task not found, or is itself a subtask" }, 400);
        }
        set("parent_id", parent.id);
        set("project_id", parent.projectId);
      }
    }

    const wasActive = Boolean(existing.active);
    const completing = data.active === false && wasActive;
    const reopening = data.active === true && !wasActive;

    if (data.active !== undefined) {
      set("active", data.active ? 1 : 0);
      // `active` alone says a task is done but not when. "Completed today", the
      // log-time prompt and the recurrence spawn all read this.
      set("completed_at", data.active ? null : new Date().toISOString());
    }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      ).bind(...values, id, workspaceId).run();
    }

    // Ticking a parent ticks its children: a parent left "done" over five open
    // subtasks is a list that disagrees with itself. Reopening does the same in
    // reverse, so the round trip is lossless.
    if ((completing || reopening) && !isSubtask) {
      await c.env.DB.prepare(
        `UPDATE tasks SET active = ?, completed_at = ? WHERE parent_id = ? AND workspace_id = ?`
      ).bind(completing ? 0 : 1, completing ? new Date().toISOString() : null, id, workspaceId).run();
    }

    // ─── Recurrence: spawn the next occurrence on completion ────────────────
    //
    // Here, not on the cron, and measured from `completedOn` — the completing
    // client's own local date. The worker runs in UTC; deriving "the next
    // weekday after today" from its clock sends the whole feature a day out for
    // anyone west of it, which is exactly the trap the calendar sync hit.
    const rule = data.recurRule !== undefined
      ? (data.recurRule === null ? null : normalizeRecurRule(data.recurRule))
      : (existing.recur_rule as string | null);

    if (completing && !isSubtask && rule && data.completedOn) {
      const due = nextOccurrence(rule, data.completedOn);
      if (due) {
        const spawnId = crypto.randomUUID();
        const now = new Date().toISOString();
        await c.env.DB.prepare(
          `INSERT INTO tasks
             (id, workspace_id, project_id, name, description, active, estimated_seconds,
              due_date, priority, sort_order, parent_id, recur_rule, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL, ?, ?)`
        ).bind(
          spawnId,
          workspaceId,
          existing.project_id,
          existing.name,
          // The notes describe what the task *is*, so every occurrence needs them.
          existing.description ?? null,
          existing.estimated_seconds ?? null,
          due,
          existing.priority ?? 4,
          (existing.sort_order as number) ?? 0,
          rule,
          now
        ).run();

        // A repeating checklist is only useful if the checklist comes back too.
        const { results: kids } = await c.env.DB.prepare(
          `SELECT name, description, estimated_seconds, priority, sort_order
             FROM tasks WHERE parent_id = ? AND workspace_id = ? ORDER BY sort_order ASC`
        ).bind(id, workspaceId).all<Row>();

        if (kids.length) {
          await c.env.DB.batch(
            kids.map((k) =>
              c.env.DB.prepare(
                `INSERT INTO tasks
                   (id, workspace_id, project_id, name, description, active, estimated_seconds,
                    due_date, priority, sort_order, parent_id, recur_rule, created_at)
                 VALUES (?, ?, ?, ?, ?, 1, ?, NULL, ?, ?, ?, NULL, ?)`
              ).bind(
                crypto.randomUUID(),
                workspaceId,
                existing.project_id,
                k.name,
                k.description ?? null,
                k.estimated_seconds ?? null,
                k.priority ?? 4,
                k.sort_order ?? 0,
                spawnId,
                now
              )
            )
          );
        }

        // The recurrence carries forward with the new occurrence; leaving it on
        // the completed one would spawn a second copy if it were ever reopened
        // and ticked again.
        await c.env.DB.prepare(
          `UPDATE tasks SET recur_rule = NULL WHERE id = ? AND workspace_id = ?`
        ).bind(id, workspaceId).run();
      }
    }

    const row = await readTask(c.env.DB, id, workspaceId);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(formatTask(row));
  })
  // ─── Delete ───────────────────────────────────────────────────────────────
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    // Explicit, not left to ON DELETE CASCADE: D1 does not guarantee
    // `PRAGMA foreign_keys` is on, and an orphaned subtask is invisible — it
    // renders nowhere and still counts toward its project's tracked total.
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM tasks WHERE parent_id = ? AND workspace_id = ?`).bind(id, workspaceId),
      c.env.DB.prepare(`DELETE FROM tasks WHERE id = ? AND workspace_id = ?`).bind(id, workspaceId),
    ]);
    return c.json({ ok: true });
  });
