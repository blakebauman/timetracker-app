-- Days off: PTO, bank holidays and half days, per user within a workspace.
--
-- `date` is a local YYYY-MM-DD, like tasks.due_date: a day off is a day, never
-- an instant, and the UTC worker never decides which day "Friday" is.
-- `portion` is which part of the day is off — 'am' means the morning is off
-- and the afternoon is worked. Pacing counts a half day as half a working day;
-- Plan my day fills only the half that's worked.
CREATE TABLE IF NOT EXISTS days_off (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  portion TEXT NOT NULL DEFAULT 'full' CHECK (portion IN ('full', 'am', 'pm')),
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per person per day: re-adding a date updates it rather than stacking.
CREATE UNIQUE INDEX IF NOT EXISTS idx_days_off_user_date ON days_off (workspace_id, user_id, date);
