// Cron materializer for recurring entries: creates each active template's
// occurrence for today once the scheduled UTC time has passed. last_materialized
// (UTC date) keeps it idempotent across the 5-minute cron cycles.

import { broadcast, upsertTags } from "../db/queries";

export async function runRecurring(env: Env): Promise<void> {
  const now = new Date();
  const todayDay = now.getUTCDay();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const todayStr = now.toISOString().slice(0, 10); // UTC yyyy-mm-dd

  // Filter in SQL so the every-5-min sweep returns zero rows on no-op ticks
  // (wrong weekday / time not reached / already materialized today) instead of
  // scanning every active template into JS. The per-row checks below repeat
  // these guards as a readable second layer.
  const { results } = await env.DB.prepare(
    `SELECT * FROM recurring_entries
     WHERE active = 1
       AND time_utc <= ?
       AND (last_materialized IS NULL OR last_materialized <> ?)
       AND instr(',' || days_of_week || ',', ?) > 0`
  )
    .bind(nowMinutes, todayStr, `,${todayDay},`)
    .all<Record<string, unknown>>();

  for (const row of results) {
    try {
      const days = String(row.days_of_week ?? "")
        .split(",")
        .filter(Boolean)
        .map(Number);
      if (!days.includes(todayDay)) continue;

      const timeUtc = row.time_utc as number;
      if (nowMinutes < timeUtc) continue; // scheduled time hasn't passed yet today
      if (row.last_materialized === todayStr) continue; // already created today

      const startMs =
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0) +
        timeUtc * 60_000;
      const duration = row.duration_seconds as number;
      const startIso = new Date(startMs).toISOString();
      const stopIso = new Date(startMs + duration * 1000).toISOString();
      const workspaceId = row.workspace_id as string;
      const entryId = crypto.randomUUID();
      const nowIso = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO time_entries
           (id, workspace_id, project_id, task_id, description, start, stop, duration, billable, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          entryId,
          workspaceId,
          (row.project_id as string | null) ?? null,
          (row.task_id as string | null) ?? null,
          (row.description as string) ?? "",
          startIso,
          stopIso,
          duration,
          row.billable ? 1 : 0,
          nowIso,
          nowIso
        )
        .run();

      let tags: string[] = [];
      try {
        const parsed = JSON.parse((row.tags as string) || "[]");
        if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
      } catch {
        tags = [];
      }
      if (tags.length) await upsertTags(env.DB, workspaceId, entryId, tags);

      await env.DB.prepare(
        `UPDATE recurring_entries SET last_materialized = ? WHERE id = ?`
      )
        .bind(todayStr, row.id)
        .run();

      await broadcast(env, workspaceId, "entries:changed", { source: "recurring" });
    } catch {
      // One template failing (deleted project FK, etc.) must not abort the rest.
    }
  }
}
