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
  'b1e015057e28b4d538d445ae93d740a3:08bd24e9822adabe20de4ec577eb185f56c7898d32b07d3ee7f8fd19bf0a17a89641ee428e780e7ce935a76aa1500727df7b37afeaae62aad1bf21adf06fb29a',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO workspaces (id, name, userId)
VALUES (
  'blakedemowrkspc00000000000000001',
  'Blake''s Workspace',
  'blakedemouser000000000000000001'
);
