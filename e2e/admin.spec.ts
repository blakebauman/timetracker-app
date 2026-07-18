import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// The admin UI needs an admin-role user (assigned manually in the DB), so the
// page itself isn't driven here — these guard the removal endpoint's
// authorization, which must hold for every signed-in non-admin.
test("admin remove-user endpoint rejects self-removal and non-admins", async ({ page }) => {
  await signUp(page);

  const session = await page.request.get("/api/auth/get-session");
  expect(session.ok()).toBeTruthy();
  const { user } = await session.json();

  // Self-removal is blocked outright (even for admins).
  const self = await page.request.delete(`/api/admin/users/${user.id}`);
  expect(self.status()).toBe(400);

  // A non-admin caller is rejected by better-auth's admin check.
  const other = await page.request.delete(`/api/admin/users/not-a-real-user-id`);
  expect(other.ok()).toBeFalsy();
  expect(other.status()).toBeGreaterThanOrEqual(400);
});
