import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { applySecurityHeaders } from "../middleware/security-headers";

/**
 * One id to join a user's report ("it said Internal error") to a log line.
 * Cloudflare's ray id is already unique per request and appears in the
 * dashboard; fall back to a UUID in dev where there is none.
 */
export function requestId(c: Context): string {
  return c.req.header("cf-ray") ?? crypto.randomUUID();
}

/**
 * app.onError. Hono's default already leaks nothing (a bare 500 text), but an
 * uncaught throw skips every middleware's post-`next()` body, so the security
 * headers and `Cache-Control: no-store` were missing from exactly the
 * responses produced by something going wrong — and there was no structured
 * log line and no id to find it by.
 */
export function onError(err: Error, c: Context): Response {
  const id = requestId(c);
  const secure = new URL(c.req.url).protocol === "https:";

  // Deliberate HTTP errors (thrown HTTPException) keep their own status/body.
  if (err instanceof HTTPException) {
    const res = err.getResponse();
    res.headers.set("X-Request-Id", id);
    res.headers.set("Cache-Control", "no-store");
    applySecurityHeaders(res.headers, secure);
    return res;
  }

  console.error("unhandled error", {
    requestId: id,
    method: c.req.method,
    path: c.req.path,
    error: err.message,
    stack: err.stack,
  });
  const res = c.json({ error: "Internal error", requestId: id }, 500);
  res.headers.set("X-Request-Id", id);
  res.headers.set("Cache-Control", "no-store");
  applySecurityHeaders(res.headers, secure);
  return res;
}

/** app.notFound — JSON like every other API response, never Hono's text. */
export function notFound(c: Context): Response {
  return c.json({ error: "Not found" }, 404);
}

/** hono/body-limit onError — the same JSON shape as every other rejection. */
export function payloadTooLarge(c: Context): Response {
  return c.json({ error: "Payload too large" }, 413);
}
