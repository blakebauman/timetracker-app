-- Drafted time entries: proposals the app writes for a day from the signals it
-- already has (calendar events that ended untracked, uncovered stretches
-- between the day's activity, and work the user logs on this weekday most
-- weeks), held here until a person confirms them.
--
-- Deliberately a SEPARATE table from time_entries rather than a `status` column
-- on it. A draft is a proposal, not time: it must never reach a report, an
-- invoice, a client-stats roll-up, a project's tracked total, or an integration
-- push. A status column would put that guarantee in the hands of every one of
-- the ~dozen queries that aggregate time_entries, forever. A separate table
-- makes it structural — confirming a draft INSERTs a real entry through the
-- same path as any other write, and the draft is deleted.
CREATE TABLE IF NOT EXISTS draft_entries (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Drafts are personal: they describe one person's day and stay invisible to
  -- the rest of the workspace until confirmed.
  user_id           TEXT NOT NULL,
  -- The user's LOCAL calendar date ('YYYY-MM-DD'). Stored rather than derived
  -- so the review screen groups a day the same way the user's clock does,
  -- without the server having to know their offset at read time.
  local_date        TEXT NOT NULL,
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id           TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  description       TEXT NOT NULL DEFAULT '',
  start             TEXT NOT NULL,
  stop              TEXT NOT NULL,
  duration          INTEGER NOT NULL,
  billable          INTEGER NOT NULL DEFAULT 0,
  -- Which signal produced this: 'calendar' | 'gap' | 'pattern'.
  source            TEXT NOT NULL,
  confidence        TEXT NOT NULL DEFAULT 'medium',
  -- Plain-language justification shown on the review card ("Google Calendar
  -- event that ended untracked", "45m gap between two entries").
  reason            TEXT,
  calendar_event_id TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_draft_entries_day
  ON draft_entries(workspace_id, user_id, local_date);

-- Regeneration is idempotent: the same calendar event can only ever hold one
-- draft, and no two drafts can claim the same slot for the same person.
CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_entries_event
  ON draft_entries(workspace_id, user_id, calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_entries_slot
  ON draft_entries(workspace_id, user_id, start, stop);
