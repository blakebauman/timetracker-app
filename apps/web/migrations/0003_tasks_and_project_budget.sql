-- Tasks: sub-items within projects, assignable to time entries
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  estimated_seconds INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, active);

-- Add task_id to time_entries
ALTER TABLE time_entries ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;

-- Add budget / scheduling fields to projects
ALTER TABLE projects ADD COLUMN start_date TEXT;
ALTER TABLE projects ADD COLUMN end_date   TEXT;
ALTER TABLE projects ADD COLUMN estimated_hours REAL;
