import { IntegrationError } from "./types";

// SSRF guard for push-integration base URLs. The base_url is user-supplied and
// the worker fetches it server-side, so an unvetted value (an internal address,
// a non-https scheme, embedded credentials) would turn the worker into a
// request-forgery proxy from Cloudflare's egress. This resolves a base_url to a
// validated https origin or throws — every adapter runs it before any fetch.

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return true; // malformed dotted-quad → unsafe
  const [a, b] = o;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast / reserved
  );
}

function isUnsafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.startsWith("[")) {
    // IPv6 literal — block loopback, ULA (fc00::/7) and link-local (fe80::/10).
    const inner = h.replace(/^\[|\]$/g, "");
    if (inner === "::1" || inner === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(inner)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(inner)) return true;
    return false;
  }
  if (isPrivateIPv4(h)) return true;
  // A public host always has a dot (a registrable domain / TLD); a single-label
  // name resolves only on an internal network, so reject it.
  if (!h.includes(".")) return true;
  return false;
}

/**
 * Validate a user-supplied integration base URL and return its https origin.
 * Pass the provider `type` to additionally pin providers whose host space is
 * well-defined (Dynamics is always *.dynamics.com).
 */
export function safeIntegrationOrigin(
  baseUrl: string,
  type?: "workfront" | "dynamics",
): string {
  let raw = (baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!raw) throw new IntegrationError("Base URL is required.");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IntegrationError("Base URL is not a valid URL.");
  }

  if (url.protocol !== "https:") throw new IntegrationError("Base URL must use https://.");
  if (url.username || url.password) throw new IntegrationError("Base URL must not embed credentials.");
  if (isUnsafeHost(url.hostname)) {
    throw new IntegrationError("Base URL must be a public host, not an internal or reserved address.");
  }
  if (type === "dynamics" && !url.hostname.toLowerCase().endsWith(".dynamics.com")) {
    throw new IntegrationError("Dynamics base URL must be a *.dynamics.com address.");
  }

  return url.origin;
}
