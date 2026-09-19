// Extend the global Env interface with non-binding secrets
// Values come from .dev.vars (local) or `wrangler secret put` (production)
interface Env {
  AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  // Google Calendar OAuth client — separate from the GOOGLE_CLIENT_ID/SECRET used
  // for login, so it can carry the calendar.readonly scope + its own redirect URI.
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
  // Outlook / Microsoft 365 calendar sync (Entra ID app registration). Optional
  // and independent of Google: with these unset the Outlook card explains that
  // the server hasn't been configured rather than failing at connect time.
  MICROSOFT_CALENDAR_CLIENT_ID?: string;
  MICROSOFT_CALENDAR_CLIENT_SECRET?: string;
  /**
   * Which Entra tenant may sign in: "common" (work, school or personal),
   * "organizations" (work/school only), "consumers", or a specific tenant id.
   * A SINGLE-TENANT app registration must set its own tenant id here — the
   * common endpoint rejects sign-ins for a single-tenant app. Defaults to
   * "common".
   */
  MICROSOFT_CALENDAR_TENANT?: string;
}
