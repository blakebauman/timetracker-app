-- Better Auth rate limiting, database-backed (September 2026 hardening).
--
-- Better Auth's built-in limiter defaults to `enabled: isProduction`, which it
-- derives from NODE_ENV — a variable that is never set in a deployed Worker
-- (config `vars` is empty and the bundle reads it at runtime, not build time).
-- So every per-endpoint rule the plugins declare (e.g. emailOTP's 3/min on
-- verify-email / check-verification-otp) was inert in production. auth.ts now
-- enables it explicitly with `storage: "database"`, which needs this table.
--
-- Column names are Better Auth's (camelCase, like the other auth tables). The
-- library reads by `key`, increments atomically with a `lastRequest <=`
-- predicate, and prunes expired rows itself by `lastRequest` — hence the two
-- indexes. `id` is added by the adapter factory on every model.
CREATE TABLE IF NOT EXISTS "rateLimit" (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ratelimit_last_request ON "rateLimit"(lastRequest);
