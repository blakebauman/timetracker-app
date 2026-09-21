import type { Context, Next } from "hono";

/**
 * The header set for every worker-served response. Shared with the error
 * handler (a thrown error skips this middleware's post-next body) and with the
 * /mcp and /agents/* handlers, which are answered before Hono.
 *
 * Note the CSP here only ever lands on JSON and WebSocket responses — the SPA
 * document's CSP is `public/_headers` (Workers static assets).
 */
export function applySecurityHeaders(headers: Headers, secure: boolean) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "Content-Security-Policy",
    // Kept identical to public/_headers so there is one policy to reason
    // about, even though this copy only ever lands on JSON and WebSocket
    // responses. No 'unsafe-inline' for scripts: the document's only
    // pre-bundle script is the external public/boot.js.
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://timetracker.run wss://timetracker.run",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join("; "),
  );
  if (secure) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export async function securityHeaders(c: Context, next: Next) {
  await next();

  // Never touch a WebSocket upgrade: the 101 response returned by the Durable
  // Object has immutable headers, and mutating them throws — which would turn
  // the handshake into a 500. (Previously masked by the CORS middleware cloning
  // the response first when it matched broad localhost origins.)
  if (c.res.status === 101) return;

  applySecurityHeaders(c.res.headers, new URL(c.req.url).protocol === "https:");
}
