// Minimal Google Calendar OAuth + read-through client for phase-1 calendar sync.
// No SDK — plain fetch against Google's OAuth and Calendar v3 REST endpoints.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// Read-only calendar access + email so we can show which account is connected.
export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

/** Stored (encrypted) per workspace in the integrations.credentials column. */
export interface GoogleCalendarTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: number; // ms epoch
  accountEmail: string;
}

/** A normalized external event surfaced to the calendar UI as a "ghost". */
export interface ExternalEvent {
  calendarEventId: string;
  title: string;
  start: string; // ISO
  stop: string; // ISO
}

export function buildConsentUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline", // request a refresh token
    prompt: "consent", // force refresh-token issuance on re-consent
    include_granted_scopes: "true",
    state: opts.state,
  });
  return `${AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(json.error_description || json.error || "Google token request failed");
  }
  return json;
}

/** Exchange an authorization code for tokens + the connected account email. */
export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<GoogleCalendarTokens> {
  const tok = await postToken({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code: opts.code,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  if (!tok.refresh_token) {
    // Happens when the user previously consented and Google withholds a new
    // refresh token. prompt=consent above should prevent this.
    throw new Error("Google did not return a refresh token — try disconnecting and reconnecting.");
  }
  const accountEmail = await fetchEmail(tok.access_token);
  return {
    refreshToken: tok.refresh_token,
    accessToken: tok.access_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
    accountEmail,
  };
}

async function fetchEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const json = (await res.json()) as { email?: string };
  return json.email ?? "";
}

/**
 * Return a valid access token, refreshing (and mutating `tokens` in place) if it
 * is expired or within 60s of expiry. Caller should persist `tokens` when
 * `refreshed` is true.
 */
export async function ensureAccessToken(
  tokens: GoogleCalendarTokens,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshed: boolean }> {
  if (tokens.expiresAt - Date.now() > 60_000) {
    return { accessToken: tokens.accessToken, refreshed: false };
  }
  const tok = await postToken({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  });
  tokens.accessToken = tok.access_token;
  tokens.expiresAt = Date.now() + tok.expires_in * 1000;
  return { accessToken: tok.access_token, refreshed: true };
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

/** Fetch primary-calendar events in [since, until], filtered to trackable ones. */
export async function listEvents(opts: {
  accessToken: string;
  since: string;
  until: string;
}): Promise<ExternalEvent[]> {
  const params = new URLSearchParams({
    timeMin: opts.since,
    timeMax: opts.until,
    singleEvents: "true", // expand recurring events into instances
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(`${EVENTS_URL}?${params}`, {
    headers: { authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Calendar events request failed (${res.status})`);
  }
  const json = (await res.json()) as { items?: GoogleEvent[] };
  const out: ExternalEvent[] = [];
  for (const ev of json.items ?? []) {
    if (ev.status === "cancelled") continue;
    // All-day events have `date` instead of `dateTime` — skip (not time-trackable).
    if (!ev.start?.dateTime || !ev.end?.dateTime) continue;
    // Skip events the user declined.
    const self = ev.attendees?.find((a) => a.self);
    if (self?.responseStatus === "declined") continue;
    out.push({
      calendarEventId: ev.id,
      title: ev.summary?.trim() || "(no title)",
      start: ev.start.dateTime,
      stop: ev.end.dateTime,
    });
  }
  return out;
}
