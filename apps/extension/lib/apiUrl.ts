// Allow-list for the API base URL the extension talks to.
//
// The bearer session token is attached to every authenticated request sent to
// this origin, so an unvalidated value would let a hostile or mistyped URL
// exfiltrate the token. Only origins we actually ship against are accepted.
// Keep this in sync with `host_permissions` in manifest.json.

export const DEFAULT_API_URL = "https://timetracker.run";

/**
 * Validate and normalize a candidate API base URL.
 *
 * Returns the bare origin (`scheme://host[:port]`, no path/query/trailing slash)
 * when the input is an allowed origin, or `null` when it should be rejected.
 */
export function normalizeApiUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const { protocol, hostname } = url;

  // Local dev worker over plaintext HTTP (matches `http://localhost/*`).
  const isLocalhost =
    protocol === "http:" &&
    (hostname === "localhost" || hostname === "127.0.0.1");

  // Production.
  const isProd = protocol === "https:" && hostname === "timetracker.run";

  // Cloudflare preview deploys. Uses the parsed hostname so lookalikes such as
  // `phish.workers.dev.attacker.com` (hostname ends in `.attacker.com`) are
  // rejected.
  const isWorkersDev =
    protocol === "https:" &&
    (hostname === "workers.dev" || hostname.endsWith(".workers.dev"));

  if (!isLocalhost && !isProd && !isWorkersDev) return null;

  return url.origin;
}
