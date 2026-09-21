import { test, expect } from "@playwright/test";

// An uptime monitor's probe: unauthenticated, cheap, touches D1, and says
// nothing about the deployment beyond up/down.
test("GET /api/health answers without a session and leaks nothing", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ ok: true });
  expect(res.headers()["cache-control"]).toBe("no-store");
});
