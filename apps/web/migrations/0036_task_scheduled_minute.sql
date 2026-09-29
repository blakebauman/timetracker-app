-- A time of day for a task: what turns a due date into a block on the calendar.
--
-- Minutes after local midnight (0–1439) on the task's `due_date`, which is
-- itself a local calendar day. Stored as local minutes, not an instant, for the
-- same reason `due_date` is a date: the worker runs in UTC and must never decide
-- what "9am" means for someone. NULL = no time, just a day. The block's length
-- is the task's estimate (30 minutes without one).
ALTER TABLE tasks ADD COLUMN scheduled_minute INTEGER;
