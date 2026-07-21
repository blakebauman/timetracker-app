import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";

// Better Auth's `session.freshAge` is set to 0 (see auth.ts) so the read-only
// Settings → Active Sessions card (GET /list-sessions) keeps working for
// returning users — Better Auth otherwise 403s that endpoint once a session is
// older than freshAge, and there is no per-endpoint override in config.
//
// The cost of that global 0 is that Better Auth ALSO drops its fresh-session
// requirement from the sensitive profile mutations (/update-user and
// /unlink-account). This middleware re-imposes it on ONLY those endpoints, so a
// stale (potentially stolen) session can't change the account's name/email or
// unlink an OAuth provider without a recent sign-in. Revoke/change-password/
// delete-user use Better Auth's separate `sensitiveSessionMiddleware` /
// current-password checks and are unaffected by freshAge.
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
