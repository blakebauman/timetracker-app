import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The idle composer and the running bar are two React trees, so every Start
 * and Stop unmounts the control that was pressed. Focus used to fall to
 * <body> and nothing was announced; and Enter in the running description —
 * "save my edit" everywhere else in the app — stopped the timer.
 */

const live = (page: import("@playwright/test").Page) =>
  page.locator('p[role="status"][aria-live="polite"]').first();

test("Start and Stop keep keyboard focus in the bar and announce themselves", async ({ page }) => {
  await signUp(page);
  const desc = page.getByPlaceholder("What are you working on?");
  await desc.fill("Stakeholder sync");
  await page.keyboard.press("Escape");
  await desc.press("Enter");

  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("placeholder")))
    .toBe("What are you working on?");
  await expect(live(page)).toHaveText(/Timer started: Stakeholder sync/);

  await page.getByRole("button", { name: "Stop timer" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Start timer" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
    .toBe("Start timer");
  await expect(live(page)).toHaveText(/Timer stopped after/);
});

test("Enter in the running description saves it and keeps the timer running", async ({ page }) => {
  await signUp(page);
  const desc = page.getByPlaceholder("What are you working on?");
  await desc.fill("Draft");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();

  await desc.fill("Draft — revised");
  await desc.press("Enter");
  await expect(live(page)).toHaveText("Description saved");
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  await expect
    .poll(async () => (await (await page.request.get("/api/time_entries/current")).json())?.description)
    .toBe("Draft — revised");
  // The bar keeps what was typed once the start round-trip lands.
  await page.waitForTimeout(1000);
  await expect(desc).toHaveValue("Draft — revised");
});
