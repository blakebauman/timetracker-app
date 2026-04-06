CREATE TABLE IF NOT EXISTS workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT 'My Workspace',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#0ea5e9',
  billable     INTEGER NOT NULL DEFAULT 0,
  rate         REAL,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS time_entries (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  description  TEXT NOT NULL DEFAULT '',
  start        TEXT NOT NULL,
  stop         TEXT,
  duration     INTEGER,
  billable     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_entry_tags (
  time_entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  tag_id        TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (time_entry_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_te_workspace_start ON time_entries(workspace_id, start DESC);
CREATE INDEX IF NOT EXISTS idx_te_running ON time_entries(workspace_id, stop) WHERE stop IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id, active);
