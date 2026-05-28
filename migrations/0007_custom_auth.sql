-- Replace better-auth with custom PBKDF2-based auth.
-- Passwords now stored directly on the user row (PBKDF2 via Web Crypto, fast on CF Workers).
-- Existing accounts stored password in the account.password column (scrypt format);
-- those hashes are incompatible — users must sign up again after this migration.

ALTER TABLE "user" ADD COLUMN passwordHash TEXT;

-- Drop tables that were only used by better-auth internals.
DROP TABLE IF EXISTS "account";
DROP TABLE IF EXISTS "verification";
