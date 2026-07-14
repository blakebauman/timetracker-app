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
      // Browser extension. Its ID is pinned via the manifest "key" (public key
      // in extension/manifest.json; see extension/.keys/README.md) so this
      // origin is stable across local dev and production. The extension signs in
      // with the standard better-auth client + bearer() plugin.
      "chrome-extension://nogikmhdpnnedmfldanickgpikmifcje",
    ],
    emailAndPassword: {
      enabled: true,
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
