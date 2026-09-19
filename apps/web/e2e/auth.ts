import type { Page } from "@playwright/test";

// Creates a fresh account and lands on the authenticated app shell. Each test
// gets its own workspace, so entries never collide.
//
// Signup goes through the API rather than the UI: the production signup page
// is passwordless (email OTP / magic link), which a test can't complete
// without a real inbox. Password endpoints stay enabled in dev/CI via
// ENABLE_PASSWORD_AUTH (.dev.vars) — the session cookie set on the API
// response is shared with the page context.
export async function signUp(page: Page) {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  // Land on the app first so we know the real origin — Better Auth rejects
  // requests without an Origin header, and API-context requests don't send one.
  await page.goto("/login");
  const origin = new URL(page.url()).origin;
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "Test User", email, password: "TestPassword123!" },
    headers: { origin },
  });
  if (!res.ok()) {
    throw new Error(`e2e sign-up failed: ${res.status()} ${await res.text()}`);
  }
  await page.goto("/");
  await page.waitForURL("/");
  return { email };
}
