import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Start is optimistic: the Stop control is on screen before the POST that
 * creates the entry has returned. A Stop inside that window used to PATCH the
 * optimistic placeholder id, 404, and surface "Failed to stop timer" while the
 * server kept the entry running. The stop has to wait for the start to settle
 * and then act on the real id.
 */
test("a stop that lands before the start request settles still stops the real entry", async ({
  page,
}) => {
  await signUp(page);

  // Hold the create long enough that the click below is guaranteed to land
  // while the placeholder is still the running entry.
  await page.route(
    (url) => url.pathname === "/api/time_entries",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    }
  );

  await page.getByPlaceholder("What are you working on?").fill("Quick one");
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.getByRole("button", { name: "Stop timer" }).click();

  // The close-out toast is the witness that the stop reached the real entry;
  // the error toast is what the placeholder id used to produce.
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "no project" })
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start timer" })).toBeVisible();

  // And the server agrees: nothing is running any more.
  await expect
    .poll(async () => (await page.request.get("/api/time_entries/current")).json())
    .toBeNull();
});

test("an edit made before the start request settles reaches the real entry", async ({ page }) => {
  await signUp(page);
  await page.route(
    (url) => url.pathname === "/api/time_entries",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    }
  );

  const desc = page.getByPlaceholder("What are you working on?");
  await desc.fill("Before");
  await page.getByRole("button", { name: "Start timer" }).click();
  // The bar is live while the placeholder is still the running entry; the
  // debounced description save used to PUT against the placeholder id.
  await desc.fill("After");

  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  await expect
    .poll(async () => {
      const current = (await (await page.request.get("/api/time_entries/current")).json()) as {
        description: string;
      } | null;
      return current?.description ?? null;
    }, { timeout: 10_000 })
    .toBe("After");
});
