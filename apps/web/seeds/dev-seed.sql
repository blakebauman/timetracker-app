-- Local-only dev seed data. NOT a migration — never applied to production.
-- Apply to your local D1 with:
--   npx wrangler d1 execute time-tracker --local --file=seeds/dev-seed.sql
--
-- Creates a demo login and ~30 days of sample data. Moved out of migrations/
-- (was 0005/0006) so `wrangler d1 migrations apply --remote` can never seed a
-- known-credential account into production.
--
-- Every statement is INSERT OR IGNORE, so re-applying is safe — including to
-- repair a drifted local DB (e.g. one seeded before the credential/member rows
-- were added, or where a Google sign-in linked onto the demo user).
--
-- Demo login: blake.bauman@gmail.com / TestPassApps2026
-- Password is Better Auth scrypt (N:16384, r:16, p:1, dkLen:64) as salt:hex.
-- Password sign-in is dev/e2e-only (ENABLE_PASSWORD_AUTH in .dev.vars).

INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
VALUES (
  'blakedemouser000000000000000001',
  'Blake Bauman',
  'blake.bauman@gmail.com',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt)
VALUES (
  'blakedemoaccnt000000000000000001',
  'blake.bauman@gmail.com',
  'credential',
  'blakedemouser000000000000000001',
  '9358cd26e84e48b8e24f0f19ead4d407:fd80c204af318730702bc2796d701c58d27022562b96e2657c61aada1f7d8d57e2ccce23f5d10e23073b94e80bbf01b9523edc4110c31084556668e6959352cb',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO workspaces (id, name, userId)
VALUES (
  'blakedemowrkspc00000000000000001',
  'Blake''s Workspace',
  'blakedemouser000000000000000001'
);

-- The organization plugin resolves workspace access via `member`, not
-- workspaces.userId — migration 0011's owner backfill runs before seeding on a
-- fresh clone, so the seed must create the demo user's membership itself.
INSERT OR IGNORE INTO "member" (id, organizationId, userId, role, createdAt)
VALUES (
  'blakedemomembr000000000000000001',
  'blakedemowrkspc00000000000000001',
  'blakedemouser000000000000000001',
  'owner',
  datetime('now')
);

-- ─── Clients ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO clients (id, workspace_id, name, archived, created_at) VALUES
  ('client001', 'blakedemowrkspc00000000000000001', 'Acme Corp',           0, '2026-01-15 10:00:00'),
  ('client002', 'blakedemowrkspc00000000000000001', 'Freelance Projects',  0, '2026-01-20 10:00:00');

-- ─── Projects ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO projects (id, workspace_id, client_id, name, color, billable, active, created_at) VALUES
  ('proj001', 'blakedemowrkspc00000000000000001', 'client001', 'Website Redesign', '#3b82f6', 1, 1, '2026-01-15 10:00:00'),
  ('proj002', 'blakedemowrkspc00000000000000001', 'client001', 'API Development',  '#8b5cf6', 1, 1, '2026-01-20 10:00:00'),
  ('proj003', 'blakedemowrkspc00000000000000001', 'client002', 'Marketing Assets', '#10b981', 0, 1, '2026-02-01 10:00:00'),
  ('proj004', 'blakedemowrkspc00000000000000001', NULL,        'Internal Admin',   '#94a3b8', 0, 1, '2026-02-01 10:00:00');

-- ─── Time Entries ─────────────────────────────────────────────────────────────
-- ~30 days of entries: 2026-03-07 through 2026-04-05
-- Durations are in seconds (1800–7200 range)

INSERT OR IGNORE INTO time_entries (id, workspace_id, project_id, description, start, stop, duration, billable, created_at, updated_at) VALUES
  -- Week 1: March 7–9
  ('entry001', 'blakedemowrkspc00000000000000001', 'proj001', 'Kickoff meeting with Acme design team',        '2026-03-07 09:00:00', '2026-03-07 10:00:00', 3600, 1, '2026-03-07 10:00:00', '2026-03-07 10:00:00'),
  ('entry002', 'blakedemowrkspc00000000000000001', 'proj001', 'Sketch wireframes for homepage layout',        '2026-03-07 13:00:00', '2026-03-07 15:30:00', 9000, 1, '2026-03-07 15:30:00', '2026-03-07 15:30:00'),
  ('entry003', 'blakedemowrkspc00000000000000001', 'proj002', 'Set up project repo and CI pipeline',          '2026-03-08 09:30:00', '2026-03-08 11:00:00', 5400, 1, '2026-03-08 11:00:00', '2026-03-08 11:00:00'),
  ('entry004', 'blakedemowrkspc00000000000000001', 'proj004', 'Weekly team standup',                          '2026-03-09 09:00:00', '2026-03-09 09:30:00', 1800, 0, '2026-03-09 09:30:00', '2026-03-09 09:30:00'),
  ('entry005', 'blakedemowrkspc00000000000000001', 'proj001', 'Design homepage hero section mockup',          '2026-03-09 10:00:00', '2026-03-09 12:30:00', 9000, 1, '2026-03-09 12:30:00', '2026-03-09 12:30:00'),

  -- Week 2: March 10–14
  ('entry006', 'blakedemowrkspc00000000000000001', 'proj002', 'Design REST API endpoints for auth',           '2026-03-10 09:00:00', '2026-03-10 11:30:00', 9000, 1, '2026-03-10 11:30:00', '2026-03-10 11:30:00'),
  ('entry007', 'blakedemowrkspc00000000000000001', 'proj003', 'Create social media banner templates',         '2026-03-10 14:00:00', '2026-03-10 16:00:00', 7200, 0, '2026-03-10 16:00:00', '2026-03-10 16:00:00'),
  ('entry008', 'blakedemowrkspc00000000000000001', 'proj001', 'Build responsive navigation component',        '2026-03-11 09:00:00', '2026-03-11 12:00:00', 10800, 1, '2026-03-11 12:00:00', '2026-03-11 12:00:00'),
  ('entry009', 'blakedemowrkspc00000000000000001', 'proj002', 'Implement JWT authentication middleware',      '2026-03-11 13:00:00', '2026-03-11 15:30:00', 9000, 1, '2026-03-11 15:30:00', '2026-03-11 15:30:00'),
  ('entry010', 'blakedemowrkspc00000000000000001', 'proj004', 'Weekly team standup',                          '2026-03-12 09:00:00', '2026-03-12 09:30:00', 1800, 0, '2026-03-12 09:30:00', '2026-03-12 09:30:00'),
  ('entry011', 'blakedemowrkspc00000000000000001', 'proj001', 'Homepage hero section — revisions from client','2026-03-12 10:00:00', '2026-03-12 11:30:00', 5400, 1, '2026-03-12 11:30:00', '2026-03-12 11:30:00'),
  ('entry012', 'blakedemowrkspc00000000000000001', 'proj003', 'Design email newsletter header',               '2026-03-13 09:00:00', '2026-03-13 10:30:00', 5400, 0, '2026-03-13 10:30:00', '2026-03-13 10:30:00'),
  ('entry013', 'blakedemowrkspc00000000000000001', 'proj002', 'Write OpenAPI spec for user endpoints',        '2026-03-13 13:00:00', '2026-03-13 15:00:00', 7200, 1, '2026-03-13 15:00:00', '2026-03-13 15:00:00'),
  ('entry014', 'blakedemowrkspc00000000000000001', NULL,       'Research accessibility guidelines',            '2026-03-14 09:00:00', '2026-03-14 10:00:00', 3600, 0, '2026-03-14 10:00:00', '2026-03-14 10:00:00'),
  ('entry015', 'blakedemowrkspc00000000000000001', 'proj001', 'Build product listing page layout',            '2026-03-14 11:00:00', '2026-03-14 14:00:00', 10800, 1, '2026-03-14 14:00:00', '2026-03-14 14:00:00'),

  -- Week 3: March 17–21
  ('entry016', 'blakedemowrkspc00000000000000001', 'proj002', 'Implement rate limiting on API routes',        '2026-03-17 09:00:00', '2026-03-17 11:00:00', 7200, 1, '2026-03-17 11:00:00', '2026-03-17 11:00:00'),
  ('entry017', 'blakedemowrkspc00000000000000001', 'proj003', 'Create product photography mock-ups',          '2026-03-17 13:00:00', '2026-03-17 15:30:00', 9000, 0, '2026-03-17 15:30:00', '2026-03-17 15:30:00'),
  ('entry018', 'blakedemowrkspc00000000000000001', 'proj001', 'Style guide — typography and colour tokens',   '2026-03-18 09:00:00', '2026-03-18 11:30:00', 9000, 1, '2026-03-18 11:30:00', '2026-03-18 11:30:00'),
  ('entry019', 'blakedemowrkspc00000000000000001', 'proj004', 'Weekly team standup',                          '2026-03-19 09:00:00', '2026-03-19 09:30:00', 1800, 0, '2026-03-19 09:30:00', '2026-03-19 09:30:00'),
  ('entry020', 'blakedemowrkspc00000000000000001', 'proj002', 'Fix auth endpoint returning 500 on bad token', '2026-03-19 10:00:00', '2026-03-19 11:30:00', 5400, 1, '2026-03-19 11:30:00', '2026-03-19 11:30:00'),
  ('entry021', 'blakedemowrkspc00000000000000001', 'proj001', 'Integrate CMS headless API into frontend',     '2026-03-20 09:00:00', '2026-03-20 12:00:00', 10800, 1, '2026-03-20 12:00:00', '2026-03-20 12:00:00'),
  ('entry022', 'blakedemowrkspc00000000000000001', 'proj003', 'Prepare brand logo variations for print',      '2026-03-21 09:00:00', '2026-03-21 10:30:00', 5400, 0, '2026-03-21 10:30:00', '2026-03-21 10:30:00'),
  ('entry023', 'blakedemowrkspc00000000000000001', 'proj002', 'Add pagination to /projects endpoint',         '2026-03-21 13:00:00', '2026-03-21 14:30:00', 5400, 1, '2026-03-21 14:30:00', '2026-03-21 14:30:00'),

  -- Week 4: March 24–28
  ('entry024', 'blakedemowrkspc00000000000000001', 'proj001', 'Implement dark mode toggle',                   '2026-03-24 09:00:00', '2026-03-24 11:00:00', 7200, 1, '2026-03-24 11:00:00', '2026-03-24 11:00:00'),
  ('entry025', 'blakedemowrkspc00000000000000001', 'proj004', 'Weekly team standup',                          '2026-03-26 09:00:00', '2026-03-26 09:30:00', 1800, 0, '2026-03-26 09:30:00', '2026-03-26 09:30:00'),
  ('entry026', 'blakedemowrkspc00000000000000001', NULL,       'Write sprint retrospective notes',             '2026-03-26 10:00:00', '2026-03-26 10:45:00', 2700, 0, '2026-03-26 10:45:00', '2026-03-26 10:45:00'),
  ('entry027', 'blakedemowrkspc00000000000000001', 'proj002', 'Write integration tests for auth flow',        '2026-03-26 11:00:00', '2026-03-26 13:30:00', 9000, 1, '2026-03-26 13:30:00', '2026-03-26 13:30:00'),
  ('entry028', 'blakedemowrkspc00000000000000001', 'proj001', 'Cross-browser testing and bug fixes',          '2026-03-27 09:00:00', '2026-03-27 12:00:00', 10800, 1, '2026-03-27 12:00:00', '2026-03-27 12:00:00'),
  ('entry029', 'blakedemowrkspc00000000000000001', 'proj003', 'Design trade show booth graphics',             '2026-03-27 13:00:00', '2026-03-27 15:00:00', 7200, 0, '2026-03-27 15:00:00', '2026-03-27 15:00:00'),
  ('entry030', 'blakedemowrkspc00000000000000001', 'proj001', 'Final QA pass before client review',           '2026-03-28 09:00:00', '2026-03-28 11:00:00', 7200, 1, '2026-03-28 11:00:00', '2026-03-28 11:00:00'),

  -- Week 5: March 31 – April 5
  ('entry031', 'blakedemowrkspc00000000000000001', 'proj002', 'Deploy staging environment on Cloudflare',     '2026-03-31 09:00:00', '2026-03-31 10:30:00', 5400, 1, '2026-03-31 10:30:00', '2026-03-31 10:30:00'),
  ('entry032', 'blakedemowrkspc00000000000000001', 'proj004', 'Weekly team standup',                          '2026-04-02 09:00:00', '2026-04-02 09:30:00', 1800, 0, '2026-04-02 09:30:00', '2026-04-02 09:30:00'),
  ('entry033', 'blakedemowrkspc00000000000000001', 'proj001', 'Client walkthrough and feedback session',       '2026-04-02 10:00:00', '2026-04-02 11:00:00', 3600, 1, '2026-04-02 11:00:00', '2026-04-02 11:00:00'),
  ('entry034', 'blakedemowrkspc00000000000000001', 'proj002', 'Fix CORS headers for production domain',       '2026-04-03 09:00:00', '2026-04-03 10:00:00', 3600, 1, '2026-04-03 10:00:00', '2026-04-03 10:00:00'),
  ('entry035', 'blakedemowrkspc00000000000000001', 'proj003', 'Finalize brand guidelines PDF export',         '2026-04-03 13:00:00', '2026-04-03 14:30:00', 5400, 0, '2026-04-03 14:30:00', '2026-04-03 14:30:00'),
  ('entry036', 'blakedemowrkspc00000000000000001', 'proj001', 'Address post-review design revisions',         '2026-04-04 09:00:00', '2026-04-04 11:30:00', 9000, 1, '2026-04-04 11:30:00', '2026-04-04 11:30:00'),
  ('entry037', 'blakedemowrkspc00000000000000001', NULL,       'Plan Q2 roadmap items',                        '2026-04-04 13:00:00', '2026-04-04 14:00:00', 3600, 0, '2026-04-04 14:00:00', '2026-04-04 14:00:00'),
  ('entry038', 'blakedemowrkspc00000000000000001', 'proj002', 'Add webhook support for project events',       '2026-04-05 09:00:00', '2026-04-05 11:30:00', 9000, 1, '2026-04-05 11:30:00', '2026-04-05 11:30:00'),
  ('entry039', 'blakedemowrkspc00000000000000001', 'proj004', 'Update internal documentation wiki',           '2026-04-05 13:00:00', '2026-04-05 14:00:00', 3600, 0, '2026-04-05 14:00:00', '2026-04-05 14:00:00');
