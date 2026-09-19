// Shared shape for calendar providers.
//
// Calendar sync started Google-only, with the provider's details spread across
// the route handlers, the cron sweep and the assistant. Adding Outlook made that
// untenable: everything downstream of "fetch this person's events" is identical
// between providers, and only OAuth endpoints and the event JSON differ. This
// module is the seam.
//
// A workspace may connect BOTH providers at once — a work calendar and a
// personal one is an ordinary arrangement, and `integrations` already keys rows
// by `type`, so nothing in the storage model had to change.

export type CalendarProviderId = "google" | "microsoft";

/** Stored (encrypted) per workspace in integrations.credentials. */
export interface CalendarTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: number; // ms epoch
  accountEmail: string;
}

/** A normalized event, surfaced to the calendar UI as a "ghost" block. */
export interface ExternalEvent {
  calendarEventId: string;
  title: string;
  start: string; // ISO 8601, UTC
  stop: string; // ISO 8601, UTC
}

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface CalendarProvider {
  id: CalendarProviderId;
  /** The `integrations.type` value rows are stored under. */
  integrationType: string;
  /** Shown in the UI: "Google Calendar", "Outlook / Microsoft 365". */
  label: string;
  /** `tenant` is Microsoft-only; Google ignores it. */
  buildConsentUrl(opts: {
    clientId: string;
    redirectUri: string;
    state: string;
    tenant?: string;
  }): string;
  exchangeCode(opts: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    tenant?: string;
  }): Promise<CalendarTokens>;
  /**
   * Return a usable access token, refreshing and mutating `tokens` in place when
   * it is expired or close to it. Callers persist when `refreshed` is true.
   */
  ensureAccessToken(
    tokens: CalendarTokens,
    clientId: string,
    clientSecret: string,
    tenant?: string
  ): Promise<{ accessToken: string; refreshed: boolean }>;
  listEvents(opts: {
    accessToken: string;
    since: string;
    until: string;
  }): Promise<ExternalEvent[]>;
}

/**
 * Credentials for a provider, or null when this deployment hasn't configured it.
 *
 * Both providers are optional and independent: a server with only Google
 * secrets set offers only Google, and the other card explains itself rather than
 * failing at connect time.
 */
export function providerCredentials(
  env: Env,
  id: CalendarProviderId
): ProviderCredentials | null {
  const pair =
    id === "google"
      ? {
          clientId: env.GOOGLE_CALENDAR_CLIENT_ID,
          clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
        }
      : {
          clientId: env.MICROSOFT_CALENDAR_CLIENT_ID,
          clientSecret: env.MICROSOFT_CALENDAR_CLIENT_SECRET,
        };
  return pair.clientId && pair.clientSecret
    ? { clientId: pair.clientId, clientSecret: pair.clientSecret }
    : null;
}

// ─── Registry ────────────────────────────────────────────────────────────────
// Type-only imports above keep this free of a runtime cycle with the two
// provider modules, which import the shapes from here.

import * as google from "./google-calendar";
import * as microsoft from "./microsoft-calendar";

export const CALENDAR_PROVIDERS: Record<CalendarProviderId, CalendarProvider> = {
  google: {
    id: "google",
    integrationType: "google_calendar",
    label: "Google Calendar",
    buildConsentUrl: google.buildConsentUrl,
    exchangeCode: google.exchangeCode,
    ensureAccessToken: google.ensureAccessToken,
    listEvents: google.listEvents,
  },
  microsoft: {
    id: "microsoft",
    integrationType: "microsoft_calendar",
    label: "Outlook / Microsoft 365",
    buildConsentUrl: microsoft.buildConsentUrl,
    exchangeCode: microsoft.exchangeCode,
    ensureAccessToken: microsoft.ensureAccessToken,
    listEvents: microsoft.listEvents,
  },
};

export const PROVIDER_IDS = Object.keys(CALENDAR_PROVIDERS) as CalendarProviderId[];

/** Narrow an untrusted path segment to a provider id. */
export function toProviderId(value: string): CalendarProviderId | null {
  return (PROVIDER_IDS as string[]).includes(value) ? (value as CalendarProviderId) : null;
}

/** The `integrations.type` values that represent a calendar connection. */
export const CALENDAR_INTEGRATION_TYPES = PROVIDER_IDS.map(
  (id) => CALENDAR_PROVIDERS[id].integrationType
);
