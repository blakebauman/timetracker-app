import type { Page } from "@playwright/test";

// Creates a fresh account via the signup form and lands on the authenticated
// app shell. Each test gets its own workspace, so entries never collide.
export async function signUp(page: Page) {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto("/signup");
  await page.fill("#name", "Test User");
  await page.fill("#email", email);
  await page.fill("#password", "TestPassword123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  return { email };
}
