-- Support tag-based report filtering (subquery on tag_id) and the byTag
-- breakdown grouping. The time_entry_tags primary key leads with
-- time_entry_id, so tag_id was not indexable on its own.
CREATE INDEX IF NOT EXISTS idx_tet_tag ON time_entry_tags(tag_id);
