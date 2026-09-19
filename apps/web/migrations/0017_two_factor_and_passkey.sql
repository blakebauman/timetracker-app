-- Two-factor (TOTP) and passkey (WebAuthn) support for Better Auth.
-- Column sets mirror the exact schemas shipped in better-auth@1.6.23
-- (two-factor/schema.mjs) and @better-auth/passkey@1.6.23 (passkey schema).
-- Conventions match the other auth tables (0011): booleans → INTEGER, dates → TEXT,
-- FKs → REFERENCES "user"(id) ON DELETE CASCADE.

-- ── twoFactor plugin ──────────────────────────────────────────────────────────────
ALTER TABLE "user" ADD COLUMN twoFactorEnabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "twoFactor" (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  backupCodes TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  verified INTEGER NOT NULL DEFAULT 1,
  failedVerificationCount INTEGER NOT NULL DEFAULT 0,
  lockedUntil TEXT
);
CREATE INDEX IF NOT EXISTS idx_twofactor_user ON "twoFactor"(userId);
CREATE INDEX IF NOT EXISTS idx_twofactor_secret ON "twoFactor"(secret);

-- ── passkey plugin (@better-auth/passkey) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "passkey" (
  id TEXT PRIMARY KEY,
  name TEXT,
  publicKey TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL,
  counter INTEGER NOT NULL,
  deviceType TEXT NOT NULL,
  backedUp INTEGER NOT NULL,
  transports TEXT,
  createdAt TEXT,
  aaguid TEXT
);
CREATE INDEX IF NOT EXISTS idx_passkey_user ON "passkey"(userId);
CREATE INDEX IF NOT EXISTS idx_passkey_credential ON "passkey"(credentialID);
