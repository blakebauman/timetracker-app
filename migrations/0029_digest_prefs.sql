-- Per-user email digest preferences, alongside the other display settings on
-- the better-auth `user` row (0014/0016/0020/0024).
--
-- Off by default. An account that has never asked for mail must never receive
-- any, and a migration that turns a recurring email on for every existing user
-- is not a preference — it's a mailing.
ALTER TABLE "user" ADD COLUMN digest_daily INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN digest_weekly INTEGER NOT NULL DEFAULT 0;

-- Local hour (0–23) the digest should arrive at.
ALTER TABLE "user" ADD COLUMN digest_hour INTEGER NOT NULL DEFAULT 8;

-- The user's UTC offset in minutes, in JS `getTimezoneOffset()` sign (west of
-- UTC is POSITIVE). Stored rather than an IANA zone because the cron has no
-- request to read a zone from, and every other local-time computation in this codebase
-- already works from this same offset. Refreshed whenever the settings page
-- loads, so it tracks DST within a day of a change.
ALTER TABLE "user" ADD COLUMN digest_tz_offset INTEGER NOT NULL DEFAULT 0;

-- Local date ('YYYY-MM-DD') each digest was last sent for. The 5-minute cron
-- would otherwise re-send for every tick inside the target hour; comparing
-- against the local date makes the send exactly-once per day without a lock.
ALTER TABLE "user" ADD COLUMN digest_daily_sent TEXT;
ALTER TABLE "user" ADD COLUMN digest_weekly_sent TEXT;

-- The sweep runs every 5 minutes and must not scan the whole user table to
-- find the (usually zero) accounts due a send.
CREATE INDEX IF NOT EXISTS idx_user_digest ON "user"(digest_daily, digest_weekly);
