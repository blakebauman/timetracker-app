import { colorForTagName } from "../lib/colors";

// Helper to broadcast events via Durable Object
export async function broadcast(
  env: Env,
  workspaceId: string,
  event: string,
  data: unknown
): Promise<void> {
  try {
    const id = env.TIMER_ROOM.idFromName(workspaceId);
    const stub = env.TIMER_ROOM.get(id);
    await stub.fetch(
      new Request("http://do/broadcast", {
        method: "POST",
        body: JSON.stringify({ event, data }),
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch {
    // Broadcast errors are non-critical — client will poll as fallback
  }
}

// SQL fragment for fetching a full time entry with joins.
// Every joined table is constrained to the entry's own workspace so a foreign
// project_id/task_id/tag_id (however it got stored) resolves to NULL instead of
// leaking another workspace's name/color — defense in depth behind the FK checks.
export const ENTRY_SELECT = `
  SELECT te.*,
    p.name  AS project_name,  p.color AS project_color,
    tk.name AS task_name,
    GROUP_CONCAT(t.name) AS tag_names
  FROM time_entries te
  LEFT JOIN projects p  ON p.id  = te.project_id AND p.workspace_id  = te.workspace_id
  LEFT JOIN tasks   tk  ON tk.id = te.task_id    AND tk.workspace_id = te.workspace_id
  LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
  LEFT JOIN tags t ON t.id = tet.tag_id AND t.workspace_id = te.workspace_id
`;

// Builds the shared WHERE clause + bindings for report queries.
// Every report query LEFT JOINs `projects p` (aliased `p`) so `p.client_id`
// is available here for the client filter. Tag filtering uses a subquery
// (NOT a join) so SUM(te.duration) is never multiplied by an entry's tag count.
export function buildReportWhere(opts: {
  workspaceId: string;
  since: string;
  until: string;
  projectIds?: string[];
  clientIds?: string[];
  taskIds?: string[];
  tagIds?: string[];
  billable?: "billable" | "nonbillable";
  search?: string;
}): { where: string; bindings: unknown[] } {
  const where = [
    `te.workspace_id = ?`,
    `te.start >= ?`,
    `te.start < ?`,
    `te.stop IS NOT NULL`,
  ];
  const bindings: unknown[] = [opts.workspaceId, opts.since, opts.until];
  const ph = (a: string[]) => a.map(() => "?").join(",");

  if (opts.projectIds?.length) {
    where.push(`te.project_id IN (${ph(opts.projectIds)})`);
    bindings.push(...opts.projectIds);
  }
  if (opts.clientIds?.length) {
    where.push(`p.client_id IN (${ph(opts.clientIds)})`);
    bindings.push(...opts.clientIds);
  }
  if (opts.taskIds?.length) {
    where.push(`te.task_id IN (${ph(opts.taskIds)})`);
    bindings.push(...opts.taskIds);
  }
  if (opts.tagIds?.length) {
    where.push(
      `te.id IN (SELECT time_entry_id FROM time_entry_tags WHERE tag_id IN (${ph(opts.tagIds)}))`
    );
    bindings.push(...opts.tagIds);
  }
  if (opts.billable === "billable") {
    where.push(`te.billable = 1`);
  } else if (opts.billable === "nonbillable") {
    where.push(`te.billable = 0`);
  }
  if (opts.search && opts.search.trim()) {
    // LIKE is case-insensitive for ASCII; escape the term's wildcards.
    const term = opts.search.trim().replace(/[%_\\]/g, "\\$&");
    where.push(`te.description LIKE ? ESCAPE '\\'`);
    bindings.push(`%${term}%`);
  }

  return { where: where.join(" AND "), bindings };
}

// SQL expression for a time entry's duration with optional per-entry rounding
// applied (used everywhere `te.duration` would appear). Integer arithmetic only
// — no ceil/floor math functions (not guaranteed on D1). Positive durations.
export function durationExpr(
  roundMode?: "off" | "nearest" | "up" | "down",
  roundMinutes?: number
): string {
  if (!roundMode || roundMode === "off" || !roundMinutes || roundMinutes <= 0) {
    return "te.duration";
  }
  const step = Math.floor(roundMinutes) * 60;
  switch (roundMode) {
    case "up":
      return `(((te.duration + ${step - 1}) / ${step}) * ${step})`;
    case "down":
      return `((te.duration / ${step}) * ${step})`;
    default: // nearest
      return `(((te.duration + ${step / 2}) / ${step}) * ${step})`;
  }
}

// Format a raw D1 time entry row into the API shape
export function formatEntry(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    projectId: (row.project_id as string | null) ?? null,
    projectName: (row.project_name as string | null) ?? null,
    projectColor: (row.project_color as string | null) ?? null,
    taskId: (row.task_id as string | null) ?? null,
    taskName: (row.task_name as string | null) ?? null,
    description: (row.description as string) ?? "",
    start: row.start as string,
    stop: (row.stop as string | null) ?? null,
    duration: (row.duration as number | null) ?? null,
    billable: Boolean(row.billable),
    tags: row.tag_names
      ? String(row.tag_names).split(",").filter(Boolean)
      : [],
    syncStatus: (row.sync_status as "synced" | "error" | null) ?? null,
    externalId: (row.external_id as string | null) ?? null,
    syncedAt: (row.synced_at as string | null) ?? null,
    syncError: (row.sync_error as string | null) ?? null,
    calendarEventId: (row.calendar_event_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getEntryById(
  db: D1Database,
  id: string,
  workspaceId: string
) {
  const { results } = await db
    .prepare(`${ENTRY_SELECT} WHERE te.id = ? AND te.workspace_id = ? GROUP BY te.id`)
    .bind(id, workspaceId)
    .all<Record<string, unknown>>();
  return results[0] ? formatEntry(results[0]) : null;
}

export async function upsertTags(
  db: D1Database,
  workspaceId: string,
  entryId: string,
  tagNames: string[]
): Promise<void> {
  for (const name of tagNames) {
    const tagId = crypto.randomUUID();
    await db
      .prepare(`INSERT OR IGNORE INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)`)
      .bind(tagId, workspaceId, name, colorForTagName(name))
      .run();

    const { results } = await db
      .prepare(`SELECT id FROM tags WHERE workspace_id = ? AND name = ?`)
      .bind(workspaceId, name)
      .all<{ id: string }>();

    if (results[0]) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO time_entry_tags (time_entry_id, tag_id) VALUES (?, ?)`
        )
        .bind(entryId, results[0].id)
        .run();
    }
  }
}
