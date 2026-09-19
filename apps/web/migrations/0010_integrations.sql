-- Third-party integrations: workspace-level connections to external systems
-- (Adobe Workfront, Microsoft Dynamics 365) that projects can be assigned to
-- so completed time entries can be pushed in each system's native format.

CREATE TABLE IF NOT EXISTS integrations (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,          -- 'workfront' | 'dynamics'
  name         TEXT NOT NULL,          -- e.g. "Workfront – Acme"
  base_url     TEXT NOT NULL,          -- workfront domain / dynamics org url
  credentials  TEXT NOT NULL,          -- AES-GCM encrypted JSON (never returned to client)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON integrations(workspace_id);

-- Assign an integration + external identifiers to a project.
ALTER TABLE projects ADD COLUMN integration_id      TEXT REFERENCES integrations(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN external_project_id TEXT;
ALTER TABLE projects ADD COLUMN external_task_id    TEXT;

-- Track push status of individual time entries.
ALTER TABLE time_entries ADD COLUMN sync_status TEXT;   -- NULL | 'synced' | 'error'
ALTER TABLE time_entries ADD COLUMN external_id TEXT;   -- id returned by the external system
ALTER TABLE time_entries ADD COLUMN synced_at   TEXT;
ALTER TABLE time_entries ADD COLUMN sync_error  TEXT;
