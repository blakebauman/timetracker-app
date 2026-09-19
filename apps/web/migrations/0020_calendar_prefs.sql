-- Per-user calendar preferences: which day the week starts on (0=Sun … 6=Sat)
-- and whether weekend columns are shown on the calendar grid. Stored on the
-- better-auth `user` row alongside the other display settings (see 0014).
-- Additive with defaults — safe for existing rows.
ALTER TABLE "user" ADD COLUMN week_start INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "user" ADD COLUMN show_weekends INTEGER NOT NULL DEFAULT 1;
