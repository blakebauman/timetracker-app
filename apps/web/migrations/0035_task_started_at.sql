-- When work on a task began: what puts it in the board's "In progress" column.
--
-- Stored rather than derived from tracked time, so a drag back to "To do" can
-- win over history — a task you parked after an hour on it is not in progress.
-- Set automatically by the first time entry logged against the task (or one of
-- its subtasks), and set or cleared by moving the card.
ALTER TABLE tasks ADD COLUMN started_at TEXT;

-- Open tasks that already have time against them start out in progress, from
-- the first entry. Done tasks are left alone; they sit in "Done" regardless.
UPDATE tasks
SET started_at = (
  SELECT MIN(te.start) FROM time_entries te
  WHERE te.workspace_id = tasks.workspace_id
    AND (te.task_id = tasks.id
         OR te.task_id IN (SELECT c.id FROM tasks c WHERE c.parent_id = tasks.id))
)
WHERE active = 1;
