import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  adminClient,
  emailOTPClient,
  magicLinkClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { refreshSession } from "./auth-session";

/**
 * The full client, with every plugin. Imported only by pages that load on
 * demand (login, sign-up, invite, settings, admin), so the plugins stay out of
 * the first load — see `lib/auth-session.ts`, which owns the session.
 *
 * Read the session through `useAuth`, never `authClient.useSession()`: this
 * client's own session store isn't the one the guard and sidebar watch.
 */
export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    adminClient(),
    emailOTPClient(),
    magicLinkClient(),
    passkeyClient(),
  ],
  fetchOptions: {
    // Any successful write here may have changed the session — a sign-in, a
    // name change, an accepted invite — so the session store refetches. Reads
    // (lists, the active organization) don't.
    onSuccess: (ctx) => {
      if (ctx.request.method !== "GET") refreshSession();
    },
  },
});
