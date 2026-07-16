-- Auto-track: when enabled on a workspace's Google Calendar connection, a Cron
-- job materializes finished calendar events into time entries automatically.
-- Additive with a default — safe for existing rows.
ALTER TABLE integrations ADD COLUMN auto_track INTEGER NOT NULL DEFAULT 0;
