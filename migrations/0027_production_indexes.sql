-- Production-readiness indexes (July 2026 audit).
--
-- verification(identifier): every OTP / magic-link sign-in looks up (and purges)
-- rows by identifier; the table was recreated in 0011 without this index, so the
-- only production sign-in path was a full table scan.
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON "verification"(identifier);

-- session(userId): list-sessions (Settings → Active Sessions card),
-- revoke-other-sessions, and user deletion all filter by userId; only token was
-- indexed.
CREATE INDEX IF NOT EXISTS idx_session_user ON "session"(userId);

-- account(providerId, accountId): Google social sign-in resolves the account by
-- provider + external account id.
CREATE INDEX IF NOT EXISTS idx_account_provider ON "account"(providerId, accountId);

-- The 5-minute cron filters active AND time_utc <= now; the old single-column
-- index covered only half the predicate.
DROP INDEX IF EXISTS idx_recurring_active;
CREATE INDEX IF NOT EXISTS idx_recurring_active_time ON recurring_entries(active, time_utc);
