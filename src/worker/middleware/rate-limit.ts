import type { Context, Next } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

// Module-level state persists for the lifetime of a Worker isolate.
// Not shared across isolate instances, but effective against single-source brute force.
const buckets = new Map<string, Bucket>();

export function rateLimit(maxPerWindow: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ??
      "unknown";
    const key = `${c.req.path}:${ip}`;
    const now = Date.now();

    const bucket = buckets.get(key);
    if (bucket && now < bucket.resetAt) {
      if (bucket.count >= maxPerWindow) {
        const retryAfter = String(Math.ceil((bucket.resetAt - now) / 1000));
        c.header("Retry-After", retryAfter);
        return c.json({ message: "Too many requests, try again later" }, 429);
      }
      bucket.count++;
    } else {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    }

    // Probabilistic cleanup to prevent unbounded map growth
    if (Math.random() < 0.05) {
      for (const [k, v] of buckets) {
        if (now >= v.resetAt) buckets.delete(k);
      }
    }

    await next();
  };
}
