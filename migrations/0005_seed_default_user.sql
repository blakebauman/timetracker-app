-- Seed default user: blake.bauman@gmail.com / TestPassApps2026
-- Password hashed with Better Auth's scrypt (N:16384, r:16, p:1, dkLen:64) as salt:hex

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
