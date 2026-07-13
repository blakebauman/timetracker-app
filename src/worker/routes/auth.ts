import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

export const COOKIE_NAME = "tt_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── PBKDF2 helpers ────────────────────────────────────────────────────────────
// Uses Web Crypto API which is hardware-accelerated in Cloudflare Workers,
// unlike the @noble/hashes scrypt pure-JS fallback that better-auth used.

function buf2hex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hex2buf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
    key,
    256,
  );
  return `pbkdf2:${buf2hex(salt)}:${buf2hex(derived)}`;
}

async function verifyPassword(
  stored: string,
  candidate: string,
): Promise<boolean> {
  if (!stored.startsWith("pbkdf2:")) return false;
  const [, saltHex, hashHex] = stored.split(":");
  const salt = hex2buf(saltHex);
  const storedHash = hex2buf(hashHex);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(candidate),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
      key,
      256,
    ),
  );
  if (derived.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ storedHash[i];
  return diff === 0;
}

function newToken(): string {
  return buf2hex(crypto.getRandomValues(new Uint8Array(32)));
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ── Router ────────────────────────────────────────────────────────────────────

type App = { Bindings: Env };
export const authRouter = new Hono<App>();

// GET /get-session
authRouter.get("/get-session", async (c) => {
  const token =
    getCookie(c, COOKIE_NAME) ??
    c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json(null);

  const row = await c.env.DB.prepare(
    `SELECT s.id AS sid, u.id AS uid, u.name, u.email, s.expiresAt
     FROM session s JOIN user u ON s.userId = u.id
     WHERE s.token = ? AND s.expiresAt > datetime('now') LIMIT 1`,
  )
    .bind(token)
    .first<{ sid: string; uid: string; name: string; email: string; expiresAt: string }>();

  if (!row) return c.json(null);

  return c.json({
    user: { id: row.uid, name: row.name, email: row.email },
    session: { id: row.sid, expiresAt: row.expiresAt },
  });
});

// POST /sign-in/email  (also used by the extension via /api/ext/sign-in)
export async function handleSignIn(c: Context<App>) {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.toLowerCase().trim();
  const password = body.password;

  if (!email || !password) {
    return c.json({ message: "Email and password are required" }, 400);
  }

  const user = await c.env.DB.prepare(
    `SELECT id, name, email, passwordHash FROM user WHERE email = ? LIMIT 1`,
  )
    .bind(email)
    .first<{ id: string; name: string; email: string; passwordHash: string | null }>();

  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    return c.json({ message: "Invalid email or password" }, 401);
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const now = new Date().toISOString();
  const sessionId = newId();

  await c.env.DB.prepare(
    `INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(sessionId, token, user.id, expiresAt, now, now)
    .run();

  const res = c.json({
    user: { id: user.id, name: user.name, email: user.email },
    session: { id: sessionId, expiresAt },
    token, // included so the browser extension can store it as a bearer token
  });

  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });

  return res;
}

authRouter.post("/sign-in/email", handleSignIn);

// POST /sign-up/email
authRouter.post("/sign-up/email", async (c) => {
  const body = await c.req.json<{ name?: string; email?: string; password?: string }>();
  const name = body.name?.trim();
  const email = body.email?.toLowerCase().trim();
  const password = body.password;

  if (!name || !email || !password) {
    return c.json({ message: "All fields are required" }, 400);
  }

  if (password.length < 8) {
    return c.json({ message: "Password must be at least 8 characters" }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM user WHERE email = ? LIMIT 1`,
  )
    .bind(email)
    .first();

  if (existing) {
    return c.json({ message: "An account with that email already exists" }, 422);
  }

  const passwordHash = await hashPassword(password);
  const userId = newId();
  const workspaceId = newId();
  const now = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO user (id, name, email, passwordHash, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    ).bind(userId, name, email, passwordHash, now, now),
    c.env.DB.prepare(
      `INSERT INTO workspaces (id, name, userId) VALUES (?, ?, ?)`,
    ).bind(workspaceId, `${name}'s Workspace`, userId),
  ]);

  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const sessionId = newId();

  await c.env.DB.prepare(
    `INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(sessionId, token, userId, expiresAt, now, now)
    .run();

  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });

  return c.json(
    {
      user: { id: userId, name, email },
      session: { id: sessionId, expiresAt },
      token,
    },
    201,
  );
});

// POST /sign-out
authRouter.post("/sign-out", async (c) => {
  const token =
    getCookie(c, COOKIE_NAME) ??
    c.req.header("Authorization")?.replace("Bearer ", "");
  if (token) {
    await c.env.DB.prepare(`DELETE FROM session WHERE token = ?`)
      .bind(token)
      .run();
  }
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.json({ success: true });
});

// POST /update-user
authRouter.post("/update-user", async (c) => {
  const token =
    getCookie(c, COOKIE_NAME) ??
    c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ message: "Unauthorized" }, 401);

  const session = await c.env.DB.prepare(
    `SELECT userId FROM session WHERE token = ? AND expiresAt > datetime('now') LIMIT 1`,
  )
    .bind(token)
    .first<{ userId: string }>();
  if (!session) return c.json({ message: "Unauthorized" }, 401);

  const { name } = await c.req.json<{ name?: string }>();
  if (!name?.trim()) return c.json({ message: "Name is required" }, 400);

  await c.env.DB.prepare(
    `UPDATE user SET name = ?, updatedAt = ? WHERE id = ?`,
  )
    .bind(name.trim(), new Date().toISOString(), session.userId)
    .run();

  return c.json({ success: true });
});

// POST /change-password
authRouter.post("/change-password", async (c) => {
  const token =
    getCookie(c, COOKIE_NAME) ??
    c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ message: "Unauthorized" }, 401);

  const row = await c.env.DB.prepare(
    `SELECT u.id, u.passwordHash
     FROM session s JOIN user u ON s.userId = u.id
     WHERE s.token = ? AND s.expiresAt > datetime('now') LIMIT 1`,
  )
    .bind(token)
    .first<{ id: string; passwordHash: string | null }>();
  if (!row) return c.json({ message: "Unauthorized" }, 401);

  const { currentPassword, newPassword } =
    await c.req.json<{ currentPassword?: string; newPassword?: string }>();

  if (!currentPassword || !newPassword) {
    return c.json({ message: "Both passwords are required" }, 400);
  }

  if (
    !row.passwordHash ||
    !(await verifyPassword(row.passwordHash, currentPassword))
  ) {
    return c.json({ message: "Current password is incorrect" }, 400);
  }

  if (newPassword.length < 8) {
    return c.json({ message: "New password must be at least 8 characters" }, 400);
  }

  const newHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  // Invalidate all other sessions so compromised old sessions stop working
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE user SET passwordHash = ?, updatedAt = ? WHERE id = ?`)
      .bind(newHash, now, row.id),
    c.env.DB.prepare(`DELETE FROM session WHERE userId = ? AND token != ?`)
      .bind(row.id, token),
  ]);

  return c.json({ success: true });
});
