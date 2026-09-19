-- Persist display settings per user so they survive a localStorage wipe and
-- follow the person across devices. currency drives money formatting in
-- reports; time_format ("24h" | "12h") drives time display.
ALTER TABLE "user" ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "user" ADD COLUMN time_format TEXT NOT NULL DEFAULT '24h';
