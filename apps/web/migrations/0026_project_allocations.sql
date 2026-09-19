-- Project Planner: per-user planned hours per project(+task) per day.
-- task_id uses '' (not NULL) for "no task" so the plain UNIQUE constraint and
-- ON CONFLICT upserts work on D1; the route maps '' <-> null at the API
-- boundary. Dates are local 'YYYY-MM-DD' strings — no timezone math anywhere.
CREATE TABLE IF NOT EXISTS project_allocations (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  project_id      TEXT NOT NULL,
  task_id         TEXT NOT NULL DEFAULT '',
  date            TEXT NOT NULL,
  planned_seconds INTEGER NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, user_id, project_id, task_id, date)
);

CREATE INDEX IF NOT EXISTS idx_allocations_ws_user_date
  ON project_allocations(workspace_id, user_id, date);
