-- Favorites: saved timer presets (description + project + task + tags + billable)
-- that can be started in one click, à la Toggl's Favorites. Tags are stored as a
-- JSON array on the row — favorites are lightweight presets, not entries, so they
-- don't need the time_entry_tags join table.
CREATE TABLE IF NOT EXISTS favorites (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  description  TEXT NOT NULL DEFAULT '',
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id      TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  billable     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_favorites_workspace ON favorites(workspace_id, created_at DESC);
