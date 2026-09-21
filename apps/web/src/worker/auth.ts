import { betterAuth } from "better-auth";
import { bearer, organization, admin, emailOTP, magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { WorkspaceInvitationEmail } from "./emails/workspace-invitation";
import { VerificationOtpEmail } from "./emails/verification-otp";
import { MagicLinkEmail } from "./emails/magic-link";
import { DeleteAccountEmail } from "./emails/delete-account";
import { sendEmail } from "./lib/mailer";

function randomSlug(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function createAuth(env: Env, baseURL: string) {
  // WebAuthn/passkey relying-party is derived from the request origin so it works
  // unchanged in local dev (localhost) and production (timetracker.run). Frontend
  // and worker share an origin here, so the RP origin is just the base origin.
  const rpURL = new URL(baseURL);

  // Better Auth silently falls back BETTER_AUTH_SECRET → AUTH_SECRET → a
  // known default string; never let that chain start. (AUTH_SECRET is a
  // different key — it encrypts integration credentials at rest.)
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is not set (wrangler secret put BETTER_AUTH_SECRET)");
  }

  const auth = betterAuth({
    // D1 is auto-detected via its batch/exec/prepare interface
    database: env.DB as unknown as Parameters<typeof betterAuth>[0]["database"],
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [
      "https://timetracker.run",
      // Browser extension. The ID below is pinned via the manifest "key" for
      // local dev/testing (see extension/.keys/README.md). NOTE: the Chrome Web
      // Store assigns its OWN id on publish — after the first upload, add the
      // published chrome-extension://<id> here too. See extension/PUBLISHING.md.
      // The extension signs in with the standard better-auth client + bearer().
      "chrome-extension://nogikmhdpnnedmfldanickgpikmifcje",
      // trustedOrigins gates CSRF origin checks AND callbackURL validation, so
      // localhost must never be trusted by the production build — any local
      // process on a user's machine could serve those origins. Compiled in for
      // dev/e2e builds only.
      ...(import.meta.env.DEV ? ["http://localhost:5173", "http://localhost:8787"] : []),
    ],
    emailAndPassword: {
      // Passwords are retired in production — sign-in is email OTP, magic link,
      // Google, or passkey. The flag (set in .dev.vars and CI only, never as a
      // deployed var) keeps the sign-up/sign-in endpoints alive for the e2e
      // suite and the local dev seed login.
      enabled: env.ENABLE_PASSWORD_AUTH === "true",
    },
    session: {
      // Disable better-auth's global "fresh session" gate so /list-sessions (the
      // Settings → Active sessions card) doesn't 403 with SESSION_NOT_FRESH once a
      // session is older than freshAge (default 1 day) — that broke the card for
      // every returning user, and better-auth has no per-endpoint override.
      // NOTE: freshAge:0 also drops the gate from /update-user, /unlink-account,
      // AND /delete-user (better-auth skips its deletion freshness check entirely
      // when freshAge is 0, and passwordless users have no current-password
      // check either) — so it is re-imposed on those three endpoints in
      // middleware/fresh-session.ts (wired in index.ts). Revoke/change-password
      // use better-auth's separate checks and are unaffected.
      freshAge: 0,
      // Serve getSession() from a signed cookie for 5 minutes instead of a D1
      // lookup on every /api/* request (workspaceMiddleware). Bearer-token
      // requests (extension) bypass this and still validate against D1.
      // Revocations can lag by up to maxAge; sign-out clears the cookie itself.
      cookieCache: {
        enabled: true,
        maxAge: 300,
      },
    },
    user: {
      // Account self-deletion (authClient.deleteUser()). Passwords are retired in
      // production, so Better Auth's password confirmation is unavailable to a
      // real user; configuring sendDeleteAccountVerification switches the flow
      // to an emailed one-time link instead: POST /delete-user (still behind
      // requireFreshSession in index.ts) only sends the email, and the account
      // is deleted when GET /delete-user/callback is opened from a browser that
      // holds the session — the token alone is not enough.
      deleteUser: {
        enabled: true,
        // Better Auth's default is also one day; pinned here because the email
        // copy promises "24 hours" and must not drift with a library default.
        deleteTokenExpiresIn: 60 * 60 * 24,
        async sendDeleteAccountVerification({ user, url }) {
          await sendEmail(env, user.email, "Confirm account deletion", DeleteAccountEmail({ url }));
        },
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Auto-create a workspace (organization) for every new user, regardless
          // of how they signed up (Google, OTP, or magic link). OTP signups have
          // no name yet (it's set right after verification), so fall back to the
          // email local-part.
          after: async (user) => {
            const displayName = user.name?.trim() || user.email.split("@")[0];
            await auth.api.createOrganization({
              body: {
                name: `${displayName}'s Workspace`,
                slug: randomSlug(),
                userId: user.id,
              },
            });
          },
        },
      },
    },
    plugins: [
      bearer(),
      organization({
        // Reuse the existing `workspaces` table instead of creating a parallel
        // `organization` table — avoids migrating every workspace_id FK.
        schema: {
          organization: {
            modelName: "workspaces",
            fields: { createdAt: "created_at" },
          },
        },
        async sendInvitationEmail(data) {
          const url = `${baseURL}/accept-invite?id=${data.id}`;
          await sendEmail(
            env,
            data.email,
            "You've been invited to a timetracker.run workspace",
            WorkspaceInvitationEmail({
              inviterName: data.inviter.user.name,
              workspaceName: data.organization.name,
              url,
            }),
          );
        },
      }),
      admin(),
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          await sendEmail(env, email, "Your timetracker.run verification code", VerificationOtpEmail({ otp }));
        },
      }),
      magicLink({
        async sendMagicLink({ email, url }) {
          await sendEmail(env, email, "Sign in to timetracker.run", MagicLinkEmail({ url }));
        },
      }),
      passkey({
        rpID: rpURL.hostname,
        rpName: "Time Tracker",
        origin: rpURL.origin,
      }),
    ],
    rateLimit: {
      // Better Auth's default is `enabled: isProduction`, computed from
      // NODE_ENV — which is never set in a deployed Worker (config `vars` is
      // empty and the bundle reads it at runtime). Left implicit, every rule
      // the plugins declare (emailOTP's 3/min on verify-email and
      // check-verification-otp, the global 100/10s) was inert in production.
      // Pin it to the build instead: on for the deployed worker, off for the
      // Vite dev server the Playwright suite runs against.
      enabled: !import.meta.env.DEV,
      // D1-backed (migration 0033), so the count is shared across isolates and
      // the increment is atomic. Costs one or two D1 queries per /api/auth/*
      // request; getSession from the cookie cache is untouched.
      storage: "database",
      // Paths that neither a plugin rule nor index.ts's own limiter covers.
      // Relative to /api/auth; plugin rules (email-otp/*) already apply once
      // enabled. Windows are seconds.
      customRules: {
        "/magic-link/verify": { window: 60, max: 10 },
        "/verify-email": { window: 60, max: 10 },
        "/forget-password": { window: 60, max: 5 },
        "/reset-password": { window: 60, max: 5 },
        "/organization/accept-invitation": { window: 60, max: 10 },
        "/passkey/verify-authentication": { window: 60, max: 10 },
        "/passkey/verify-registration": { window: 60, max: 10 },
        "/delete-user/callback": { window: 60, max: 5 },
        "/admin/*": { window: 60, max: 30 },
      },
    },
    advanced: {
      // CSRF/origin checks stay ON. The web app (cookies) and the browser
      // extension are both covered by trustedOrigins above — the extension's
      // pinned chrome-extension:// origin is trusted, and it authenticates with
      // bearer tokens (bearer() plugin) rather than cookies.
      // Prefix for cookie names, to avoid collisions with other apps on the same domain
      cookiePrefix: "timetracker",
      // Rate-limit keys and session IPs come from Cloudflare's header only.
      // Better Auth's default reads x-forwarded-for and gives up (null) when
      // the chain has more than one hop — and Cloudflare APPENDS to a
      // client-supplied XFF, so any caller who sends their own would collapse
      // every request into one shared bucket and lock real users out.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
  });

  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
