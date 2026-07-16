-- Recurring entries: templates that auto-materialize a completed time entry on a
-- weekly schedule (e.g. "Daily standup, 15m, weekdays at 09:00"). The Cron job
-- (already added for calendar auto-track) creates each day's occurrence.
--
-- Schedule is stored in UTC — days_of_week is a comma list of UTC weekdays
-- (0=Sun … 6=Sat) and time_utc is minutes since UTC midnight. The client converts
-- the user's local day/time selection to/from UTC, so the Cron comparison is a
-- trivial UTC check. last_materialized (UTC yyyy-mm-dd) dedupes within a day.
CREATE TABLE IF NOT EXISTS recurring_entries (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  description       TEXT NOT NULL DEFAULT '',
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id           TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  tags              TEXT NOT NULL DEFAULT '[]',
  billable          INTEGER NOT NULL DEFAULT 0,
  duration_seconds  INTEGER NOT NULL,
  days_of_week      TEXT NOT NULL,           -- e.g. "1,2,3,4,5" (UTC weekdays)
  time_utc          INTEGER NOT NULL,        -- minutes since UTC midnight
  active            INTEGER NOT NULL DEFAULT 1,
  last_materialized TEXT,                    -- UTC yyyy-mm-dd of last occurrence
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recurring_workspace ON recurring_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_entries(active);
