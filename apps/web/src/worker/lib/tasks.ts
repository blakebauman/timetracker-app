/**
 * Task writes and reads, shared by the REST route, the MCP server and the
 * Assistant's tools — so a task created from a chat window obeys exactly the
 * same invariants as one created in the app: one level of subtasks, subtasks
 * inherit their parent's project and never repeat, completing a repeating task
 * spawns the next occurrence (from the caller's *local* date), a parent ticks
 * its children, and tags resolve onto the shared vocabulary.
 *
 * Callers own transport concerns: status codes, and broadcasting
 * `tasks:changed` to open tabs.
 */
import type { CreateTask, UpdateTask } from "@timetracker/core/schemas";
import {
  addLocalDays,
  daysBetweenLocal,
  nextOccurrence,
  normalizeRecurRule,
} from "@timetracker/core/task-recurrence";
import { canonicalTagNames, taskTagStatements } from "../db/queries";

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
    startedAt: (row.started_at as string | null) ?? null,
    scheduledMinute: (row.scheduled_minute as number | null) ?? null,
    deadlineDate: (row.deadline_date as string | null) ?? null,
    // json_group_array, not GROUP_CONCAT: a tag name may contain a comma.
    tags: row.tag_names ? (JSON.parse(row.tag_names as string) as (string | null)[]).filter((n): n is string => !!n) : [],
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
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = tk.id AND c.active = 0) AS subtask_done,
    (SELECT json_group_array(t.name) FROM task_tags tt
       JOIN tags t ON t.id = tt.tag_id AND t.workspace_id = tk.workspace_id
       WHERE tt.task_id = tk.id) AS tag_names
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

/**
 * A repeating task's next deadline keeps the same lead over its due date: a
 * report planned Monday and owed Friday is, next week, planned Monday and owed
 * Friday. Without a due date to measure from there's no lead to keep, so the
 * next occurrence carries no deadline rather than a stale one.
 */
function shiftedDeadline(existing: Row, nextDue: string): string | null {
  const deadline = existing.deadline_date as string | null;
  const due = existing.due_date as string | null;
  if (!deadline || !due) return null;
  return addLocalDays(nextDue, daysBetweenLocal(due, deadline));
}

/** Next free sort key within a project, so a new task lands at the end. */
async function nextSortOrder(db: D1Database, workspaceId: string, projectId: string) {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks WHERE workspace_id = ? AND project_id = ?`)
    .bind(workspaceId, projectId)
    .first<Row>();
  return ((row?.m as number) ?? 0) + 1;
}

export type TaskRecord = ReturnType<typeof formatTask>;
export type TaskResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404; error: string };

export interface ListTasksOptions {
  projectId?: string;
  includeInactive?: boolean;
  /** Only open top-level tasks due on or before this local date. */
  dueOnOrBefore?: string;
}

export async function listTasks(
  db: D1Database,
  workspaceId: string,
  opts: ListTasksOptions = {}
): Promise<TaskRecord[]> {
  let where = `WHERE tk.workspace_id = ?`;
  const bindings: unknown[] = [workspaceId];
  if (opts.projectId) { where += ` AND tk.project_id = ?`; bindings.push(opts.projectId); }
  if (!opts.includeInactive) { where += ` AND tk.active = 1`; }
  if (opts.dueOnOrBefore) { where += ` AND tk.due_date IS NOT NULL AND tk.due_date <= ?`; bindings.push(opts.dueOnOrBefore); }
  // Ordered so a client that renders the list as-is still gets a sane order:
  // the manual sequence first, then name as the stable tiebreak.
  const { results } = await db
    .prepare(`${TASK_SELECT} ${where} ORDER BY tk.sort_order ASC, tk.name ASC`)
    .bind(...bindings)
    .all<Row>();
  return results.map(formatTask);
}

export async function getTask(db: D1Database, workspaceId: string, id: string): Promise<TaskRecord | null> {
  const row = await readTask(db, id, workspaceId);
  return row ? formatTask(row) : null;
}

export async function createTask(
  db: D1Database,
  workspaceId: string,
  data: CreateTask
): Promise<TaskResult<TaskRecord>> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // An id from another workspace, or one a model invented, is a 400 with a
  // reason, not a foreign-key failure surfacing as a 500.
  const project = await db
    .prepare(`SELECT 1 FROM projects WHERE id = ? AND workspace_id = ?`)
    .bind(data.projectId, workspaceId)
    .first();
  if (!project && !data.parentId) return { ok: false, status: 400, error: "Project not found" };

    let parentId: string | null = null;
    let projectId = data.projectId;
    if (data.parentId) {
      const parent = await resolveParent(db, data.parentId, workspaceId);
      if (!parent) {
        return { ok: false, status: 400, error: "Parent task not found, or is itself a subtask" };
      }
      parentId = parent.id;
      // A subtask always belongs to its parent's project — the row inherits the
      // project badge, so letting the two diverge would render a lie.
      projectId = parent.projectId;
    }

    // Recurrence lives on the thing you actually schedule. A repeating subtask
    // would spawn siblings inside a parent that never repeats.
    const recurRule = parentId ? null : normalizeRecurRule(data.recurRule);

    await db.prepare(
      `INSERT INTO tasks
         (id, workspace_id, project_id, name, description, active, estimated_seconds,
          due_date, priority, sort_order, parent_id, recur_rule, scheduled_minute,
          deadline_date, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      workspaceId,
      projectId,
      data.name,
      data.description ?? null,
      data.estimatedSeconds ?? null,
      data.dueDate ?? null,
      data.priority ?? 4,
      await nextSortOrder(db, workspaceId, projectId),
      parentId,
      recurRule,
      // A time needs a day to sit on.
      data.dueDate ? (data.scheduledMinute ?? null) : null,
      data.deadlineDate ?? null,
      now
    ).run();
    if (data.tags?.length) {
      const names = await canonicalTagNames(db, workspaceId, data.tags);
      await db.batch(taskTagStatements(db, workspaceId, id, names));
    }

    const row = await readTask(db, id, workspaceId);
    return { ok: true, value: formatTask(row!) };
}

export async function updateTask(
  db: D1Database,
  workspaceId: string,
  id: string,
  data: UpdateTask
): Promise<TaskResult<TaskRecord & { spawnedTaskId: string | null }>> {
    const existing = await db.prepare(
      `SELECT * FROM tasks WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<Row>();
    if (!existing) return { ok: false, status: 404, error: "Not found" };

    const isSubtask = Boolean(existing.parent_id);
    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, value: unknown) => { fields.push(`${col} = ?`); values.push(value); };

    if (data.name !== undefined)             set("name", data.name);
    if (data.description !== undefined)      set("description", data.description ?? null);
    if (data.estimatedSeconds !== undefined) set("estimated_seconds", data.estimatedSeconds ?? null);
    if (data.dueDate !== undefined)          set("due_date", data.dueDate ?? null);
    // Clearing the day clears the time with it: a 2pm with no date is nowhere.
    if (data.dueDate === null)               set("scheduled_minute", null);
    else if (data.scheduledMinute !== undefined) set("scheduled_minute", data.scheduledMinute ?? null);
    if (data.priority !== undefined)         set("priority", data.priority);
    if (data.deadlineDate !== undefined)     set("deadline_date", data.deadlineDate ?? null);
    if (data.sortOrder !== undefined)        set("sort_order", data.sortOrder);
    if (data.inProgress !== undefined) {
      // Keep the original start when it's already set: re-marking a task in
      // progress shouldn't rewrite when work on it began.
      if (data.inProgress) {
        fields.push("started_at = COALESCE(started_at, ?)");
        values.push(new Date().toISOString());
      } else {
        set("started_at", null);
      }
    }
    if (data.recurRule !== undefined && !isSubtask) {
      set("recur_rule", data.recurRule === null ? null : normalizeRecurRule(data.recurRule));
    }

    if (data.parentId !== undefined) {
      if (data.parentId === null) {
        set("parent_id", null);
      } else {
        const parent = await resolveParent(db, data.parentId, workspaceId);
        // Its own child can't become its parent, and neither can it. A task
        // with subtasks can't become one either — its children would sit two
        // levels deep. Counted here because `existing` is a bare row with no
        // `subtask_total`; reading that column off it always passed.
        const child = await db.prepare(
          `SELECT 1 FROM tasks WHERE parent_id = ? AND workspace_id = ? LIMIT 1`
        ).bind(id, workspaceId).first();
        if (!parent || parent.id === id || child) {
          return { ok: false, status: 400, error: "Parent task not found, or is itself a subtask" };
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
      await db.prepare(
        `UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      ).bind(...values, id, workspaceId).run();
    }
    if (data.tags !== undefined) {
      const names = await canonicalTagNames(db, workspaceId, data.tags);
      await db.batch(taskTagStatements(db, workspaceId, id, names));
    }

    // Ticking a parent ticks its children: a parent left "done" over five open
    // subtasks is a list that disagrees with itself. Reopening does the same in
    // reverse, so the round trip is lossless.
    if ((completing || reopening) && !isSubtask) {
      await db.prepare(
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

    let spawnedTaskId: string | null = null;
    if (completing && !isSubtask && rule && data.completedOn) {
      const due = nextOccurrence(rule, data.completedOn);
      if (due) {
        const spawnId = crypto.randomUUID();
        spawnedTaskId = spawnId;
        const now = new Date().toISOString();
        await db.prepare(
          `INSERT INTO tasks
             (id, workspace_id, project_id, name, description, active, estimated_seconds,
              due_date, priority, sort_order, parent_id, recur_rule, scheduled_minute,
              deadline_date, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
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
          // A 9am stand-up is at 9am every time it comes round.
          data.scheduledMinute !== undefined ? data.scheduledMinute : (existing.scheduled_minute ?? null),
          shiftedDeadline(existing, due),
          now
        ).run();

        // Its tags come round with it — same kind of work each time.
        await db.prepare(
          `INSERT OR IGNORE INTO task_tags (task_id, tag_id) SELECT ?, tag_id FROM task_tags WHERE task_id = ?`
        ).bind(spawnId, id).run();

        // A repeating checklist is only useful if the checklist comes back too.
        const { results: kids } = await db.prepare(
          `SELECT name, description, estimated_seconds, priority, sort_order
             FROM tasks WHERE parent_id = ? AND workspace_id = ? ORDER BY sort_order ASC`
        ).bind(id, workspaceId).all<Row>();

        if (kids.length) {
          await db.batch(
            kids.map((k) =>
              db.prepare(
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
        await db.prepare(
          `UPDATE tasks SET recur_rule = NULL WHERE id = ? AND workspace_id = ?`
        ).bind(id, workspaceId).run();
      }
    }

    const row = await readTask(db, id, workspaceId);
    if (!row) return { ok: false, status: 404, error: "Not found" };
    // `spawnedTaskId` is what makes undoing a repeating task's completion
    // possible: the client deletes that occurrence and reopens this one with
    // the rule, instead of leaving a duplicate next occurrence behind.
    return { ok: true, value: { ...formatTask(row), spawnedTaskId } };
}

/** Delete a task, its subtasks and their tag links. */
export async function deleteTask(db: D1Database, workspaceId: string, id: string): Promise<void> {
  // Explicit, not left to ON DELETE CASCADE: D1 does not guarantee
  // `PRAGMA foreign_keys` is on, and an orphaned subtask is invisible — it
  // renders nowhere and still counts toward its project's tracked total.
  await db.batch([
    db.prepare(
      `DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE (id = ? OR parent_id = ?) AND workspace_id = ?)`
    ).bind(id, id, workspaceId),
    db.prepare(`DELETE FROM tasks WHERE parent_id = ? AND workspace_id = ?`).bind(id, workspaceId),
    db.prepare(`DELETE FROM tasks WHERE id = ? AND workspace_id = ?`).bind(id, workspaceId),
  ]);
}
