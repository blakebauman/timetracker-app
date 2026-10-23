-- Closing a week: the person's "this week's hours are what I submitted" mark.
--
-- `week_start` is the local YYYY-MM-DD the week begins on (per the user's
-- week-start setting at the time). `snapshot` is JSON — seconds per project
-- per day as they stood at close — so a later edit, from any path (an inline
-- edit, a calendar drag, auto-track, the Assistant, MCP), shows up as a
-- difference to re-submit instead of silently diverging from what was sent.
CREATE TABLE IF NOT EXISTS week_closures (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  week_start     TEXT NOT NULL,
  total_seconds  INTEGER NOT NULL,
  snapshot       TEXT NOT NULL,
  closed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_week_closures_user_week
  ON week_closures (workspace_id, user_id, week_start);
