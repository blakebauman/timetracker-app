-- Tag colors: give each tag a swatch (mirrors projects.color) so tags read at a
-- glance on entries, the calendar, and reports. Additive with a neutral default.
ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT '#64748b';
