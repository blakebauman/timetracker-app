-- Reintroduce Better Auth (see f7d78cd for the removal, and the "audit better-auth"
-- plan for why: the scrypt-on-Workers latency bug was in @better-auth/utils's package
-- export map, fixed upstream in 0.4.1 — better-auth@1.6.23 pins 0.4.2, well past it.
-- There is exactly one real user today, so this is a clean cutover, not a zero-downtime
-- migration: the existing user's passwordHash is dropped and they re-register (see
-- migrate skill output / plan runbook for reassigning their existing workspace data).

-- ── Core Better Auth tables dropped by 0007_custom_auth.sql ──────────────────────
CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_user ON "account"(userId);

CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT,
  updatedAt TEXT
);

-- ── Admin plugin fields ───────────────────────────────────────────────────────────
ALTER TABLE "user" ADD COLUMN role TEXT;
ALTER TABLE "user" ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN banReason TEXT;
ALTER TABLE "user" ADD COLUMN banExpires TEXT;
ALTER TABLE "session" ADD COLUMN impersonatedBy TEXT;

-- ── Organization plugin: reuse "workspaces" as the organization model ────────────
-- (avoids migrating every workspace_id FK across time_entries/projects/clients/tasks/
-- integrations — see createAuth()'s schema.organization.modelName/fields remap)
ALTER TABLE workspaces ADD COLUMN slug TEXT;
ALTER TABLE workspaces ADD COLUMN logo TEXT;
ALTER TABLE workspaces ADD COLUMN metadata TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);

ALTER TABLE "session" ADD COLUMN activeOrganizationId TEXT;

CREATE TABLE IF NOT EXISTS "member" (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_org ON "member"(organizationId);
CREATE INDEX IF NOT EXISTS idx_member_user ON "member"(userId);

CREATE TABLE IF NOT EXISTS "invitation" (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expiresAt TEXT NOT NULL,
  inviterId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invitation_org ON "invitation"(organizationId);

-- Backfill: turn today's implicit "workspaces.userId = owner" into an explicit
-- member row, so existing workspaces keep working under the organization plugin.
INSERT INTO "member" (id, organizationId, userId, role, createdAt)
SELECT lower(hex(randomblob(16))), id, userId, 'owner', datetime('now')
FROM workspaces
WHERE userId IS NOT NULL;

-- Placeholder slugs for pre-existing workspaces (there's only ever been one dev
-- workspace at this stage); real signups get human-readable slugs going forward.
UPDATE workspaces SET slug = lower(hex(randomblob(8))) WHERE slug IS NULL;

-- ── Drop the custom-auth-only column ──────────────────────────────────────────────
-- Safe: no FK/UNIQUE/index on this column, unlike workspaces.userId (see below).
ALTER TABLE "user" DROP COLUMN passwordHash;

-- NOTE: workspaces.userId (added by 0004_auth.sql) is now superseded by "member"
-- but is intentionally NOT dropped here. SQLite can't drop a column that carries
-- an inline FK and is covered by an index (idx_workspaces_user) without a full
-- 12-step table rebuild, and several live tables FK into workspaces(id). Leave it
-- as unused dead weight; a follow-up migration can do the rebuild later.
