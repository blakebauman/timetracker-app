-- Tenant foreign keys for the two tables that never had them, the dead TOTP
-- table, and a composite index on the hottest lookup in the app.
--
-- saved_reports (0015) and assistant_memory (0025) carried workspace_id with
-- no REFERENCES, unlike every other tenant table: deleting a workspace or a
-- user left their rows behind forever — an erasure gap, and a latent
-- cross-tenant footgun if an id were ever reused. SQLite cannot ADD a
-- constraint, so each is rebuilt: create, copy (skipping today's orphans —
-- rows whose workspace/user no longer exist are exactly the rows the FK would
-- have removed), drop, rename, re-index. Nothing references either table, so
-- no FK points at the rows being moved. The file runs as one D1 batch, which
-- is atomic.

CREATE TABLE saved_reports_new (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  config       TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO saved_reports_new (id, workspace_id, user_id, name, config, created_at, updated_at)
  SELECT s.id, s.workspace_id, s.user_id, s.name, s.config, s.created_at, s.updated_at
  FROM saved_reports s
  WHERE EXISTS (SELECT 1 FROM workspaces w WHERE w.id = s.workspace_id)
    AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = s.user_id);
DROP TABLE saved_reports;
ALTER TABLE saved_reports_new RENAME TO saved_reports;
CREATE INDEX IF NOT EXISTS idx_saved_reports_ws_user ON saved_reports(workspace_id, user_id);

CREATE TABLE assistant_memory_new (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
INSERT INTO assistant_memory_new (id, workspace_id, key, content, created_at, updated_at)
  SELECT m.id, m.workspace_id, m.key, m.content, m.created_at, m.updated_at
  FROM assistant_memory m
  WHERE EXISTS (SELECT 1 FROM workspaces w WHERE w.id = m.workspace_id);
DROP TABLE assistant_memory;
ALTER TABLE assistant_memory_new RENAME TO assistant_memory;
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_memory_ws_key ON assistant_memory(workspace_id, key);
CREATE INDEX IF NOT EXISTS idx_assistant_memory_ws_updated ON assistant_memory(workspace_id, updated_at);

-- TOTP two-factor was retired with passwords (#73); nothing has referenced
-- this table since, and it carried an index on the secret column of a table
-- no code reads. user.twoFactorEnabled stays: dropping a column on a live
-- SQLite table is another rebuild, and the default 0 is harmless.
DROP INDEX IF EXISTS idx_twofactor_secret;
DROP INDEX IF EXISTS idx_twofactor_user;
DROP TABLE IF EXISTS "twoFactor";

-- Membership is re-verified on every request with
--   WHERE organizationId = ? AND userId = ?
-- (middleware/workspace.ts). Two single-column indexes made SQLite pick one
-- and filter; the composite serves the lookup directly, and UNIQUE makes
-- "one membership row per user per workspace" a database fact.
--
-- Duplicates can exist (the dev seed's demo membership was inserted twice:
-- once by the seed, once by the 0011 backfill). Keep one row per pair — the
-- highest role, then the earliest — so the unique index can be built; the
-- rows removed are the same membership stated twice.
DELETE FROM "member" WHERE rowid NOT IN (
  SELECT (
    SELECT m2.rowid FROM "member" m2
    WHERE m2.organizationId = m1.organizationId AND m2.userId = m1.userId
    ORDER BY CASE m2.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m2.createdAt, m2.rowid
    LIMIT 1
  )
  FROM "member" m1
  GROUP BY m1.organizationId, m1.userId
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_org_user ON "member"(organizationId, userId);
