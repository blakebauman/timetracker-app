import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The timer bar's description suggestions.
 *
 * The click case is the one that regressed: the field is a Popover *Anchor*,
 * not a *Trigger*, so Radix's dismissable layer counted the very focus that
 * opened the list as an outside interaction and dismissed it — a ~230ms flash,
 * after which the field still held focus, so clicking again did nothing.
 * Asserting it is STILL open after a beat is the whole point; a plain
 * toBeVisible() passes during the flash.
 */
test.describe("description autocomplete", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    for (const d of ["Homepage hero rebuild", "Client feedback pass", "Sprint planning"]) {
      await page.request.post("/api/time_entries", {
        headers: { origin },
        data: {
          description: d,
          start: new Date(Date.now() - 7200_000).toISOString(),
          stop: new Date(Date.now() - 3600_000).toISOString(),
        },
      });
    }
    await page.reload();
  });

  test("clicking the field opens the list and keeps it open", async ({ page }) => {
    const list = page.locator("#description-suggestions");
    await page.getByPlaceholder("What are you working on?").click();
    await expect(list).toBeVisible();
    // Long enough to outlast the exit animation the flash was hiding behind.
    await page.waitForTimeout(700);
    await expect(list).toBeVisible();
  });

  test("escape, selection and focus loss each still close it", async ({ page }) => {
    const input = page.getByPlaceholder("What are you working on?");
    const list = page.locator("#description-suggestions");

    await input.click();
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();

    // Typing reopens and filters.
    await input.fill("home");
    await expect(list).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(1);

    // Picking a row fills the field and closes.
    await page.getByRole("option").first().click();
    await expect(list).toBeHidden();
    await expect(input).toHaveValue("Homepage hero rebuild");

    // Focus genuinely leaving still dismisses — that path is the field's own
    // onBlur, which is why the Radix focus-outside check was safe to suppress.
    await input.fill("");
    await input.click();
    await expect(list).toBeVisible();
    await page.getByRole("link", { name: "Projects" }).first().focus();
    await expect(list).toBeHidden();
  });
});
