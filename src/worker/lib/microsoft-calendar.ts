// Outlook / Microsoft 365 calendar: OAuth 2.0 (Microsoft identity platform v2)
// + a read-through Microsoft Graph client. No SDK — plain fetch, mirroring
// lib/google-calendar.ts so the two are trivially comparable.

import type { CalendarTokens, ExternalEvent } from "./calendar-providers";

const GRAPH_CALENDAR_VIEW = "https://graph.microsoft.com/v1.0/me/calendar/calendarView";

/**
 * `Calendars.Read` rather than `Calendars.ReadWrite` — sync is inbound only and
 * the app must never be able to alter someone's calendar. `offline_access` is
 * what makes a refresh token appear at all; without it the connection would die
 * an hour after consent. `openid`/`email` name the connected account in the UI.
 */
export const SCOPES = [
  "openid",
  "email",
  "offline_access",
  "https://graph.microsoft.com/Calendars.Read",
].join(" ");

const authority = (tenant: string | undefined) =>
  `https://login.microsoftonline.com/${tenant || "common"}/oauth2/v2.0`;

export function buildConsentUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  tenant?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    response_mode: "query",
    scope: SCOPES,
    state: opts.state,
  });
  return `${authority(opts.tenant)}/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function postToken(
  tenant: string | undefined,
  body: Record<string, string>
): Promise<TokenResponse> {
  const res = await fetch(`${authority(tenant)}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(
      json.error_description || json.error || "Microsoft token request failed"
    );
  }
  return json;
}

/**
 * The signed-in account's address, for display only.
 *
 * Read from the id_token's payload rather than by calling Graph /me: it's
 * already in the token response, so it saves a round trip on every connect.
 * Deliberately NOT verified — nothing is authorized on the basis of this value;
 * it exists so the Settings card can say which account is connected. (Microsoft
 * explicitly warns against treating tokens for APIs you don't own as
 * verifiable.) Personal accounts often carry `email`; work/school accounts
 * frequently only carry `preferred_username`.
 */
function accountFromIdToken(idToken: string | undefined): string {
  if (!idToken) return "";
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return "";
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    ) as { email?: string; preferred_username?: string; upn?: string };
    return json.email || json.preferred_username || json.upn || "";
  } catch {
    return "";
  }
}

export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  tenant?: string;
}): Promise<CalendarTokens> {
  const tok = await postToken(opts.tenant, {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code: opts.code,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
    scope: SCOPES,
  });
  if (!tok.refresh_token) {
    throw new Error(
      "Microsoft did not return a refresh token — the app registration is missing the offline_access scope."
    );
  }
  return {
    refreshToken: tok.refresh_token,
    accessToken: tok.access_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
    accountEmail: accountFromIdToken(tok.id_token),
  };
}

export async function ensureAccessToken(
  tokens: CalendarTokens,
  clientId: string,
  clientSecret: string,
  tenant?: string
): Promise<{ accessToken: string; refreshed: boolean }> {
  if (tokens.expiresAt - Date.now() > 60_000) {
    return { accessToken: tokens.accessToken, refreshed: false };
  }
  const tok = await postToken(tenant, {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES,
  });
  tokens.accessToken = tok.access_token;
  tokens.expiresAt = Date.now() + tok.expires_in * 1000;
  // Microsoft ROTATES refresh tokens: the response may carry a new one, and the
  // old one should be discarded. Google's doesn't, which is why its client has
  // no equivalent line — miss this and the connection dies the first time the
  // old token is retired, with a confusing invalid_grant weeks later.
  if (tok.refresh_token) tokens.refreshToken = tok.refresh_token;
  return { accessToken: tok.access_token, refreshed: true };
}

interface GraphEvent {
  id: string;
  subject?: string;
  isCancelled?: boolean;
  isAllDay?: boolean;
  showAs?: string;
  responseStatus?: { response?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
}

/**
 * Graph returns local-naive timestamps — "2026-08-24T16:00:00.0000000" with the
 * zone in a sibling field — so they are NOT parseable as-is. We ask for UTC via
 * the Prefer header and stamp the Z ourselves. Without this every event lands
 * shifted by the server's idea of local time, which on a Worker is UTC, so it
 * would look correct in exactly the environment where it's tested and wrong for
 * every user west of it.
 */
function toIso(value: { dateTime?: string; timeZone?: string } | undefined): string | null {
  if (!value?.dateTime) return null;
  const raw = value.dateTime;
  const iso = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Events in [since, until] from the user's default calendar, trackable ones only. */
export async function listEvents(opts: {
  accessToken: string;
  since: string;
  until: string;
}): Promise<ExternalEvent[]> {
  const params = new URLSearchParams({
    startDateTime: opts.since,
    endDateTime: opts.until,
    // calendarView expands recurring series into instances, which is what the
    // ghost blocks need — /events would return series masters instead.
    $top: "250",
    $orderby: "start/dateTime",
  });

  const out: ExternalEvent[] = [];
  let url: string | null = `${GRAPH_CALENDAR_VIEW}?${params}`;
  // Graph pages with @odata.nextLink. Bounded so a pathological calendar can't
  // spin the worker; 250 × 8 is far past any realistic visible range.
  for (let page = 0; url && page < 8; page++) {
    const res: Response = await fetch(url, {
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        prefer: 'outlook.timezone="UTC"',
      },
    });
    if (!res.ok) {
      throw new Error(`Microsoft Graph calendarView request failed (${res.status})`);
    }
    const json = (await res.json()) as {
      value?: GraphEvent[];
      "@odata.nextLink"?: string;
    };
    for (const ev of json.value ?? []) {
      if (ev.isCancelled) continue;
      // All-day blocks aren't time-trackable, same as Google's date-only events.
      if (ev.isAllDay) continue;
      if (ev.responseStatus?.response === "declined") continue;
      const start = toIso(ev.start);
      const stop = toIso(ev.end);
      if (!start || !stop) continue;
      out.push({
        calendarEventId: ev.id,
        title: ev.subject?.trim() || "(no title)",
        start,
        stop,
      });
    }
    url = json["@odata.nextLink"] ?? null;
  }
  return out;
}
