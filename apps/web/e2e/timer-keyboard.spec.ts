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

test("tags can be added from the bar while a timer runs", async ({ page }) => {
  await signUp(page);
  await page.getByPlaceholder("What are you working on?").fill("Tagged");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();

  await page.getByRole("button", { name: "Add tags" }).click();
  await page.keyboard.type("onsite");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Remove tag onsite" })).toBeVisible();
  await expect
    .poll(async () => ((await (await page.request.get("/api/time_entries/current")).json()) as { tags: string[] })?.tags)
    .toEqual(["onsite"]);
});

test("Discard stays on the Stop row at mid and wide widths", async ({ page }) => {
  await signUp(page);
  await page.getByPlaceholder("What are you working on?").fill(
    "A deliberately long description for a workshop that runs across several topics and clients"
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  for (const width of [900, 1100, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(200);
    const stop = await page.getByRole("button", { name: "Stop timer" }).boundingBox();
    const discard = await page.getByRole("button", { name: "Discard timer" }).boundingBox();
    expect(Math.abs(stop!.y + stop!.height / 2 - (discard!.y + discard!.height / 2)), `@${width}`).toBeLessThan(12);
  }
});
