-- Aski's long-term memory: durable facts/preferences the assistant learns about
-- the user ("always mark Acme non-billable", "I start my day at 9am"). Scoped to
-- workspace like every other tenant row. `key` is a stable slug so the assistant
-- can upsert a fact rather than accumulate duplicates; recall reads the most
-- recently-updated rows into the chat system prompt.
CREATE TABLE assistant_memory (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_assistant_memory_ws_key ON assistant_memory (workspace_id, key);
CREATE INDEX idx_assistant_memory_ws_updated ON assistant_memory (workspace_id, updated_at);
