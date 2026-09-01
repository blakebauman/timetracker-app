-- A task's own notes: the detail that doesn't belong in its name.
--
-- Separate from the time entry's description. The entry describes what you did
-- in that span and goes to a client; this describes what the task *is*, and
-- stays internal. Conflating them is how an acceptance-criteria list ends up on
-- an invoice line.
ALTER TABLE tasks ADD COLUMN description TEXT;
