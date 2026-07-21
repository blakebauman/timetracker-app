-- Neutralized: this migration previously seeded ~30 days of demo time entries,
-- clients, and projects into the demo workspace. As a tracked migration it would
-- pollute PRODUCTION on any fresh/restored database.
--
-- Dev seed data now lives in seeds/dev-seed.sql (local-only, never a migration):
--   npx wrangler d1 execute time-tracker --local --file=seeds/dev-seed.sql
--
-- Kept as a no-op (not deleted) so the D1 migration ledger / numbering stays
-- intact. The statement below is valid SQL that affects no rows.
SELECT 1 WHERE 0;
