-- A deadline, distinct from the due date.
--
-- `due_date` is when you plan to work on a task; `deadline_date` is when it has
-- to be done. They drift apart constantly — you plan to start the report on
-- Monday because it's owed on Friday — and folding them into one date either
-- hides the commitment or makes the plan lie. A local `YYYY-MM-DD` day, like
-- `due_date`, never an instant. NULL = no hard deadline.
ALTER TABLE tasks ADD COLUMN deadline_date TEXT;
