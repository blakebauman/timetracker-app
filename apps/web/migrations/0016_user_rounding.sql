-- Persist the report rounding preference per user (like currency / time_format)
-- so it sticks across sessions and devices. mode: off | nearest | up | down.
ALTER TABLE "user" ADD COLUMN round_mode TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "user" ADD COLUMN round_minutes INTEGER NOT NULL DEFAULT 15;
