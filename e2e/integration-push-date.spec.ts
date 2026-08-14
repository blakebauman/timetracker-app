import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { addManualEntry } from "./entry-helpers";

// Workfront and Dynamics file an entry against a calendar day, and the server
// stores only UTC instants — so the push has to carry the zone the day was
// lived in. Pinned west of UTC, where the two disagree all evening.
test.use({ timezoneId: "America/Denver" });

test("pushing entries carries the browser's timezone so the work date is local", async ({
  page,
}) => {
  await signUp(page);

  // An integration has to exist for the bulk bar to offer the push at all.
  const integration = await page.request.post("/api/integrations", {
    data: {
      type: "workfront",
      name: "Acme Workfront",
      baseUrl: "https://acme.my.workfront.com",
      credentials: { apiKey: "k" },
    },
  });
  expect(integration.status()).toBe(201);

  await page.goto("/");
  await addManualEntry(page, {
    description: "Evening push",
    start: "18:30",
    stop: "19:30",
  });

  // Intercept rather than let it out: the adapter would try to reach a real
  // Workfront host. The assertion is on what the client sends.
  let pushBody: { timezone?: string; entryIds?: string[] } | null = null;
  await page.route("**/api/integrations/push", async (route) => {
    pushBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ id: pushBody?.entryIds?.[0], ok: true }] }),
    });
  });

  const row = page.locator("div.group", { hasText: "Evening push" }).first();
  await row.getByRole("checkbox", { name: "Select entry" }).click();
  await page.getByRole("button", { name: "Push to integration" }).click();

  await expect.poll(() => pushBody?.timezone).toBe("America/Denver");
});
