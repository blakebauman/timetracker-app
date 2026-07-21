import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { DEFAULT_API_URL } from "./apiUrl";

// Standard better-auth client for the extension popup.
//
// Auth uses the server's bearer() plugin: on sign-in the session token comes
// back in the `set-auth-token` response header, which we persist to
// chrome.storage.local. Every request re-attaches it as `Authorization: Bearer`
// by reading that key back (an empty value sends no header, i.e. signed out).
//
// chrome.storage.local is the shared home for the token so the background
// service worker can reuse it for badge polling. `baseURL` is the stored,
// allow-listed API URL (see ./apiUrl) and must be known when the client is
// built, so the popup constructs one via this factory after reading storage.

export type ExtAuthClient = ReturnType<typeof makeAuthClient>;

export function makeAuthClient(baseURL: string = DEFAULT_API_URL) {
  return createAuthClient({
    baseURL,
    // Sign-in is email OTP only: the popup can't complete a magic-link flow
    // (the link opens the web app, so the session would land in cookies there,
    // never in this client's bearer-token storage).
    plugins: [emailOTPClient()],
    fetchOptions: {
      auth: {
        type: "Bearer",
        token: async () =>
          (
            (await chrome.storage.local.get("authToken")) as {
              authToken?: string;
            }
          ).authToken ?? "",
      },
      onSuccess: async (ctx) => {
        const token = ctx.response.headers.get("set-auth-token");
        if (token) await chrome.storage.local.set({ authToken: token });
      },
    },
  });
}
