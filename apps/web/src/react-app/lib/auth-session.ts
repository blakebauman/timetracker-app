import { createAuthClient } from "better-auth/react";

/**
 * The session, and nothing else: the one Better Auth client the first load
 * imports. `useAuth` (the route guard, the sidebar) reads the session through
 * it and signs out through it.
 *
 * Everything that needs a plugin — passkeys, email OTP and magic link,
 * organizations, admin — goes through `authClient` in `lib/auth-client.ts`,
 * which only the login, invite, settings and admin pages import. Those
 * plugins were ~6 kB gz of first load that the Timer never uses.
 *
 * Two clients means two session stores, and Better Auth only syncs them
 * between tabs (a localStorage `storage` event never fires in the tab that
 * wrote it). So this store is the source of truth: `authClient` tells it to
 * refetch after every successful write, and nothing reads `authClient`'s own
 * session store.
 */
export const sessionClient = createAuthClient();

/** Refetch the session (after `authClient` signs in, updates the user, …). */
export function refreshSession(): void {
  sessionClient.$store.notify("$sessionSignal");
}
