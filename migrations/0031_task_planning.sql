-- Tasks become the plan side of the timer: a due date, a priority, an explicit
-- order, one level of subtasks, and per-task recurrence.
--
-- `due_date` is a local calendar date (YYYY-MM-DD), not a timestamp. A due date
-- is a *day*; storing an instant would drag the whole timezone-reconciliation
-- problem (see digest_tz_offset, and the Graph local-naive trap) into a field
-- that never needed it.
ALTER TABLE tasks ADD COLUMN due_date TEXT;

-- 1 = highest … 4 = none. Defaulting to 4 keeps every existing task unprioritised
-- rather than silently promoting it.
ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 4;

-- Fractional index: a drag rewrites one row (the midpoint between its new
-- neighbours), never the whole list.
ALTER TABLE tasks ADD COLUMN sort_order REAL;

-- One level only. A subtask may not itself be a parent — enforced in
-- routes/tasks.ts, since SQLite can't express it as a constraint.
ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;

-- `active = 0` says a task is done but not *when*. "Completed today", the
-- recurrence spawn and the log-time prompt all need the timestamp.
ALTER TABLE tasks ADD COLUMN completed_at TEXT;

-- A small explicit vocabulary — daily | weekdays | weekly:0,2,4 | monthly:15 —
-- not RRULE. Weekdays are *local*; the next occurrence is computed from the
-- completing client's local date, so no cron and no timezone guessing.
ALTER TABLE tasks ADD COLUMN recur_rule TEXT;

UPDATE tasks SET sort_order = rowid * 1.0 WHERE sort_order IS NULL;
UPDATE tasks SET completed_at = created_at WHERE active = 0 AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(workspace_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
-- The task row now rolls its subtasks' tracked time up into its own total, so
-- every list read fans out over time_entries by task_id.
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
