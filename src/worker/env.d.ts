// Extend the global Env interface with non-binding secrets
// Values come from .dev.vars (local) or `wrangler secret put` (production)
interface Env {
  AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  // Google Calendar OAuth client — separate from the GOOGLE_CLIENT_ID/SECRET used
  // for login, so it can carry the calendar.readonly scope + its own redirect URI.
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
}
