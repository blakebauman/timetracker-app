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

// Format a raw D1 time entry row into the API shape
export function formatEntry(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    projectId: (row.project_id as string | null) ?? null,
    projectName: (row.project_name as string | null) ?? null,
    projectColor: (row.project_color as string | null) ?? null,
    description: (row.description as string) ?? "",
    start: row.start as string,
    stop: (row.stop as string | null) ?? null,
    duration: (row.duration as number | null) ?? null,
    billable: Boolean(row.billable),
    tags: row.tag_names
      ? String(row.tag_names)
          .split(",")
          .filter(Boolean)
      : [],
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
    .prepare(
      `
      SELECT te.*,
        p.name as project_name, p.color as project_color,
        GROUP_CONCAT(t.name) as tag_names
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
      LEFT JOIN tags t ON t.id = tet.tag_id
      WHERE te.id = ? AND te.workspace_id = ?
      GROUP BY te.id
    `
    )
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
      .prepare(
        `INSERT OR IGNORE INTO tags (id, workspace_id, name) VALUES (?, ?, ?)`
      )
      .bind(tagId, workspaceId, name)
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
