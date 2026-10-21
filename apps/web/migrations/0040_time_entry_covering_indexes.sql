-- Covering indexes for the hot time_entries aggregates, and stats for the planner.
--
-- 1. Task rollup. lib/tasks.ts TASK_TRACKED_SECONDS_SQL seeks entries by
--    (task_id, workspace_id) and reads stop + duration. Carrying them in the
--    index makes the per-task sum index-only. Replaces idx_time_entries_task
--    (task_id), which is its prefix, so the FK's ON DELETE SET NULL lookup
--    still has an index.
DROP INDEX IF EXISTS idx_time_entries_task;
CREATE INDEX IF NOT EXISTS idx_te_task_cover
  ON time_entries(task_id, workspace_id, stop, duration);

-- 2. Project totals. The projects list (routes/projects.ts) and pacing
--    (lib/pacing.ts) sum every entry a project has ever logged, joined on
--    (workspace_id, project_id). Same prefix as idx_te_project, plus the
--    columns those sums read, so the join never touches the table.
DROP INDEX IF EXISTS idx_te_project;
CREATE INDEX IF NOT EXISTS idx_te_project_cover
  ON time_entries(workspace_id, project_id, stop, start, duration, billable);

-- 3. (workspace_id, billable) is two values per workspace: it can't narrow a
--    query, but with no stats the planner picked it as "an index on
--    workspace_id" and walked every entry the workspace had — the task rollup
--    did this once per task. Every entry write also paid to maintain it.
DROP INDEX IF EXISTS idx_te_billable;

-- 4. Better Auth looks invitations up by email when one is accepted.
CREATE INDEX IF NOT EXISTS idx_invitation_email ON invitation(email);

-- Stats, so the planner weighs these indexes on data rather than guesses.
PRAGMA optimize;
