-- Per-user preference: auto-assign a distinct palette color to new projects so
-- the UI gets visual variety without picking a color each time. Additive default.
ALTER TABLE "user" ADD COLUMN auto_assign_colors INTEGER NOT NULL DEFAULT 0;
