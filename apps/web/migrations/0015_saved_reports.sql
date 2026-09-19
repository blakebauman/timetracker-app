-- Per-user saved report configurations (date range + filters + rounding +
-- grouping) so a user can re-open a report view. Scoped to workspace + user.
CREATE TABLE IF NOT EXISTS saved_reports (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  config       TEXT NOT NULL, -- JSON: { range, filters, rounding, group, subGroup }
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_ws_user
  ON saved_reports(workspace_id, user_id);
