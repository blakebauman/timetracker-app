-- Per-user saved views of the task list: a name and the All tab's filters,
-- search, grouping and sort. Same shape as saved_reports, with the tenant
-- foreign keys 0034 had to retrofit onto that table from the start.
CREATE TABLE IF NOT EXISTS saved_task_views (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  config       TEXT NOT NULL, -- JSON: TaskViewConfig (packages/core schemas)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saved_task_views_ws_user
  ON saved_task_views(workspace_id, user_id);
