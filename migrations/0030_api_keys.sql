-- Workspace API keys: the credential an outside program presents instead of a
-- browser session. Today that program is an MCP client (Claude, ChatGPT, or any
-- other), reading a workspace's projects, entries, reports and pacing.
--
-- Only the SHA-256 of the key is stored. The plaintext is shown once, at
-- creation, and is unrecoverable afterwards — a key list that can reveal its own
-- secrets is a database read away from being a breach.
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- The person who minted it. Requests made with this key act as them, so their
  -- removal from the workspace must take the key's access with it.
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  -- First few characters of the plaintext ("tt_live_a1b2c3…"), so a person can
  -- tell two keys apart in the UI without either being recoverable.
  prefix       TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  -- 'read' | 'read_write'. Write tools (start/stop a timer, log an entry) are
  -- refused outright on a read key rather than failing at the database.
  scope        TEXT NOT NULL DEFAULT 'read',
  last_used_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every authenticated MCP request is a lookup by hash; it must be an index hit,
-- and it must be unique so one plaintext can never resolve to two workspaces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON api_keys(workspace_id);
