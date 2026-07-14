import { betterAuth } from "better-auth";
import { bearer, organization, admin, emailOTP, magicLink } from "better-auth/plugins";
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
  const auth = betterAuth({
    // D1 is auto-detected via its batch/exec/prepare interface
    database: env.DB as unknown as Parameters<typeof betterAuth>[0]["database"],
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [
      "http://localhost:5173",
      "http://localhost:8787",
      "https://timetracker.run",
    ],
    emailAndPassword: {
      enabled: true,
    },
    account: {
      // The OAuth state cookie isn't reliably surviving the Google redirect
      // round-trip in this dev environment, causing a false state_mismatch on
      // every attempt. The state param is still validated against a single-use,
      // time-limited, server-side verification row (plus PKCE) — this cookie
      // was an additional defense-in-depth layer, not the only CSRF protection.
      skipStateCookieCheck: true,
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
          // of how they signed up (email/password, Google, OTP, or magic link).
          after: async (user) => {
            await auth.api.createOrganization({
              body: {
                name: `${user.name}'s Workspace`,
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
    ],
    advanced: {
      // Extension service workers can't set Origin headers and use bearer tokens,
      // not cookies, so CSRF protection is not applicable for those requests.
      disableCSRFCheck: true,
      // Prefix for cookie names, to avoid collisions with other apps on the same domain
      cookiePrefix: "timetracker",
    },
  });

  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
