import { cors } from "hono/cors";

// Exact-match allow-list, shared with trustedOrigins in auth.ts. Never
// prefix/suffix-match on the raw origin string: startsWith("http://localhost")
// also matches http://localhost.evil.com, *.workers.dev is registrable by
// anyone, and chrome-extension://* is every extension — only the pinned one is
// ours.
export const PRODUCTION_ORIGINS = [
  "https://timetracker.run",
  // Pinned dev extension ID (manifest "key") — add the Chrome Web Store ID
  // after first publish. See extension/PUBLISHING.md.
  "chrome-extension://nogikmhdpnnedmfldanickgpikmifcje",
] as const;
const ALLOWED_ORIGINS = new Set<string>(PRODUCTION_ORIGINS);

/**
 * Dev/e2e builds only: a local dev server on any port. The vite dev server
 * runs on 5173 by default, but another project often holds it, and a pinned
 * port made the app on any other port refuse its own sign-in, sockets and
 * Assistant chat. The pattern matches the whole origin — scheme, the literal
 * host `localhost`, a port, nothing after — so it is still an exact-format
 * match, not a prefix (`http://localhost.evil.com` fails it). `import.meta.env.DEV`
 * is false in the production build, so this is never true there.
 */
const DEV_LOCAL_ORIGIN = /^http:\/\/localhost:\d{1,5}$/;
export function isDevLocalOrigin(origin: string | undefined | null): boolean {
  return import.meta.env.DEV && !!origin && DEV_LOCAL_ORIGIN.test(origin);
}

/**
 * Whether a browser-supplied Origin is one of ours. Shared with the two
 * WebSocket upgrade paths (/api/ws and /agents/*): CORS can only decorate a
 * cross-site handshake, not refuse it, and the only thing keeping evil.example
 * from opening wss://timetracker.run/api/ws with a victim's cookies was the
 * session cookie's SameSite=Lax — a library default rather than a check of
 * our own. Browsers always send Origin on a WebSocket handshake.
 */
export function isAllowedOrigin(origin: string | undefined | null): boolean {
  return !!origin && (ALLOWED_ORIGINS.has(origin) || isDevLocalOrigin(origin));
}

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return "*";
    return isAllowedOrigin(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
});
