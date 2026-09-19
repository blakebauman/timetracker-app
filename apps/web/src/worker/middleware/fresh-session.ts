import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";

// Better Auth's `session.freshAge` is set to 0 (see auth.ts) so the read-only
// Settings → Active Sessions card (GET /list-sessions) keeps working for
// returning users — Better Auth otherwise 403s that endpoint once a session is
// older than freshAge, and there is no per-endpoint override in config.
//
// The cost of that global 0 is that Better Auth ALSO drops its fresh-session
// requirement from the sensitive mutations: /update-user, /unlink-account, and
// /delete-user (with freshAge 0 Better Auth skips its deletion freshness check
// entirely, and passwordless users have no current-password check — without
// this gate any stolen cookie or bearer token could irreversibly delete the
// account). This middleware re-imposes freshness on those three endpoints
// (wired in index.ts). Revoke/change-password use Better Auth's separate
// `sensitiveSessionMiddleware` / current-password checks and are unaffected.
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // mirrors Better Auth's default freshAge (1 day)

export const requireFreshSession = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const origin = new URL(c.req.url).origin;
  const auth = createAuth(c.env, origin);

  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) return c.json({ error: "Unauthorized" }, 401);

  const createdAt = new Date(result.session.createdAt).getTime();
  if (Number.isFinite(createdAt) && Date.now() - createdAt >= FRESH_WINDOW_MS) {
    return c.json(
      {
        error: "Please sign in again before changing these account settings.",
        code: "SESSION_NOT_FRESH",
      },
      403,
    );
  }

  await next();
});
