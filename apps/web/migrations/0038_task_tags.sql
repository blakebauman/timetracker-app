-- Tags on tasks, from the same workspace `tags` table entries use.
--
-- One vocabulary, not two: a task tagged "discovery" and an entry tagged
-- "discovery" are the same tag, report the same way, and share a colour.
-- Entries created against a task inherit its tags (routes/time-entries.ts),
-- which is the point of sharing the table.
CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);
