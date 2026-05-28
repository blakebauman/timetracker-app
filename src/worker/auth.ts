import { getCookie } from "hono/cookie";
import { COOKIE_NAME } from "./routes/auth";

export type SessionUser = { id: string; name: string; email: string };
export type AuthSession = { user: SessionUser; sessionId: string } | null;

// Lightweight session lookup used by the workspace middleware.
// Checks the tt_session cookie first, then the Authorization: Bearer header.
export async function getSession(
  db: D1Database,
  c: { req: { header: (name: string) => string | undefined; url: string }; get: (key: string) => unknown },
): Promise<AuthSession> {
  const token =
    getCookie(c as never, COOKIE_NAME) ??
    c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return null;

  const row = await db
    .prepare(
      `SELECT s.id AS sid, u.id AS uid, u.name, u.email
       FROM session s JOIN user u ON s.userId = u.id
       WHERE s.token = ? AND s.expiresAt > datetime('now') LIMIT 1`,
    )
    .bind(token)
    .first<{ sid: string; uid: string; name: string; email: string }>();

  if (!row) return null;
  return {
    user: { id: row.uid, name: row.name, email: row.email },
    sessionId: row.sid,
  };
}
