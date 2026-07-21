import { betterAuth } from "better-auth";
import { bearer, organization, admin, emailOTP, magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

const FROM_ADDRESS = "noreply@timetracker.run";

function randomSlug(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// The EMAIL binding's simulated builder overload isn't reliable in local dev
// (Miniflare expects a raw MIME message), so build one directly — this works
// identically in local dev and production.
async function sendEmail(env: Env, to: string, subject: string, text: string, html: string) {
  const msg = createMimeMessage();
  msg.setSender({ addr: FROM_ADDRESS });
  msg.setRecipient(to);
  msg.setSubject(subject);
  msg.addMessage({ contentType: "text/plain", data: text });
  msg.addMessage({ contentType: "text/html", data: html });
  await env.EMAIL.send(new EmailMessage(FROM_ADDRESS, to, msg.asRaw()));
}

export function createAuth(env: Env, baseURL: string) {
  // WebAuthn/passkey relying-party is derived from the request origin so it works
  // unchanged in local dev (localhost) and production (timetracker.run). Frontend
  // and worker share an origin here, so the RP origin is just the base origin.
  const rpURL = new URL(baseURL);

  const auth = betterAuth({
    // D1 is auto-detected via its batch/exec/prepare interface
    database: env.DB as unknown as Parameters<typeof betterAuth>[0]["database"],
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [
      "http://localhost:5173",
      "http://localhost:8787",
      "https://timetracker.run",
      // Browser extension. The ID below is pinned via the manifest "key" for
      // local dev/testing (see extension/.keys/README.md). NOTE: the Chrome Web
      // Store assigns its OWN id on publish — after the first upload, add the
      // published chrome-extension://<id> here too. See extension/PUBLISHING.md.
      // The extension signs in with the standard better-auth client + bearer().
      "chrome-extension://nogikmhdpnnedmfldanickgpikmifcje",
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
      // NOTE: freshAge:0 also drops the gate from /update-user and /unlink-account,
      // so it is re-imposed on ONLY those two endpoints in middleware/fresh-session.ts
      // (wired in index.ts). Revoke/change-password/delete-user use better-auth's
      // separate sensitive-session / current-password checks and are unaffected.
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
      // Enables the account self-deletion flow (authClient.deleteUser()).
      deleteUser: {
        enabled: true,
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
          const text = `${data.inviter.user.name} invited you to join "${data.organization.name}" on timetracker.run: ${url}`;
          const html = `<p>${data.inviter.user.name} invited you to join <strong>${data.organization.name}</strong> on timetracker.run.</p><p><a href="${url}">${url}</a></p>`;
          await sendEmail(env, data.email, "You've been invited to a timetracker.run workspace", text, html);
        },
      }),
      admin(),
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          const text = `Your verification code is ${otp}. It expires in 5 minutes.`;
          await sendEmail(env, email, "Your timetracker.run verification code", text, `<p>${text}</p>`);
        },
      }),
      magicLink({
        async sendMagicLink({ email, url }) {
          const text = `Sign in to timetracker.run: ${url}`;
          const html = `<p>Click below to sign in to timetracker.run:</p><p><a href="${url}">${url}</a></p>`;
          await sendEmail(env, email, "Sign in to timetracker.run", text, html);
        },
      }),
      passkey({
        rpID: rpURL.hostname,
        rpName: "Time Tracker",
        origin: rpURL.origin,
      }),
    ],
    advanced: {
      // CSRF/origin checks stay ON. The web app (cookies) and the browser
      // extension are both covered by trustedOrigins above — the extension's
      // pinned chrome-extension:// origin is trusted, and it authenticates with
      // bearer tokens (bearer() plugin) rather than cookies.
      // Prefix for cookie names, to avoid collisions with other apps on the same domain
      cookiePrefix: "timetracker",
    },
  });

  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
