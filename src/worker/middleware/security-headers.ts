import type { Context, Next } from "hono";

export async function securityHeaders(c: Context, next: Next) {
  await next();

  const isSecure = new URL(c.req.url).protocol === "https:";

  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // inline needed by Vite dev & React
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' wss: ws:",
      "frame-ancestors 'none'",
    ].join("; "),
  );

  if (isSecure) {
    c.res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
}
