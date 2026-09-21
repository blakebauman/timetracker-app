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

  // Production. Exact hostname match on the parsed URL, so lookalikes such as
  // `timetracker.run.attacker.com` are rejected.
  //
  // `*.workers.dev` used to be allowed too, "for preview deploys" — but the
  // worker has `workers_dev: false` and `preview_urls: false`, so no such
  // origin exists, while workers.dev is a shared space anyone can register a
  // name in. A user talked into pasting `https://evil.workers.dev` would have
  // handed that name their session token.
  const isProd = protocol === "https:" && hostname === "timetracker.run";

  if (!isLocalhost && !isProd) return null;

  return url.origin;
}
