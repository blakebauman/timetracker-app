-- Performance indexes for common query patterns that were missing.
CREATE INDEX IF NOT EXISTS idx_te_project    ON time_entries(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_te_billable   ON time_entries(workspace_id, billable);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(workspace_id, client_id);
CREATE INDEX IF NOT EXISTS idx_clients_workspace ON clients(workspace_id, archived);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, active);
CREATE INDEX IF NOT EXISTS idx_tags_workspace ON tags(workspace_id);
