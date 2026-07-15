-- Calendar sync: link a tracked entry back to the external calendar event it was
-- confirmed from, so that event stops appearing as an unconfirmed "ghost".
-- Additive + nullable — safe for existing rows and the currently-deployed code.
ALTER TABLE time_entries ADD COLUMN calendar_event_id TEXT;

-- Fast "is this event already confirmed?" lookup, scoped per workspace.
CREATE INDEX IF NOT EXISTS idx_time_entries_calendar_event
  ON time_entries(workspace_id, calendar_event_id);
