import type { Context, MiddlewareHandler } from "hono";

/**
 * Per-route rate limiting on the Workers Rate Limiting binding.
 *
 * The previous implementation was a module-level Map: honest about being
 * per-isolate, but that made every configured ceiling really
 * `limit × isolates` — an attacker spread across colos (or one user with a
 * few tabs on a busy day) multiplied it freely. The binding is shared across
 * isolates in a colo and is the durable answer for the auth and email-sending
 * limiters, where per-isolate was the last line of defence. (The zone WAF rate
 * rule is the cross-colo backstop; see docs/ARCHITECTURE.md.)
 *
 * Each binding fixes its own limit/period in wrangler.jsonc (`ratelimits`), so
 * a middleware instance picks the binding and the key; the key is prefixed
 * with the route path so one binding can guard several routes without them
 * sharing a bucket (that was the old `path:ip` semantics).
 *
 * In dev the binding is still consulted — a missing or misnamed binding fails
 * loudly instead of at deploy — but a `success: false` outcome is ignored so
 * the Playwright suite's one-signup-per-test pattern never trips it.
 */
type Env2 = { Bindings: Env; Variables: { workspaceId?: string; userId?: string } };
type KeyOf = (c: Context<Env2>) => string | undefined;

const ip = (c: Context<Env2>) => c.req.header("cf-connecting-ip");

/** Keyed by client IP — for unauthenticated surfaces (sign-in, OTP, invites). */
export const byIp: KeyOf = ip;
/** Keyed by the session user — falls back to IP before workspaceMiddleware. */
export const byUser: KeyOf = (c) => c.get("userId") ?? ip(c);
/** Keyed by workspace — the right unit for shared cost (AI calls, outbound fetches). */
export const byWorkspace: KeyOf = (c) => c.get("workspaceId") ?? ip(c);

export function rateLimit(
  pick: (env: Env) => RateLimit,
  keyOf: KeyOf = byIp,
): MiddlewareHandler<Env2> {
  return async (c, next) => {
    const subject = keyOf(c) ?? "unknown";
    const { success } = await pick(c.env).limit({ key: `${c.req.path}:${subject}` });
    if (!success && !import.meta.env.DEV) {
      // Bindings only expose pass/fail, not the remaining window; every binding
      // here uses a 60s period, so that is the honest upper bound.
      c.header("Retry-After", "60");
      return c.json({ message: "Too many requests, try again later" }, 429);
    }
    await next();
  };
}

/**
 * The same check for code paths that run before Hono (the /mcp handler).
 * Returns a ready 429 Response, or null when the request may proceed.
 */
export async function rateLimitOrReject(limiter: RateLimit, key: string): Promise<Response | null> {
  const { success } = await limiter.limit({ key });
  if (success || import.meta.env.DEV) return null;
  return new Response(JSON.stringify({ message: "Too many requests, try again later" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": "60",
      "Cache-Control": "no-store",
    },
  });
}
