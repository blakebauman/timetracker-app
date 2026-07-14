import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

test.describe("running timer sync", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("restores the running entry into the timer bar after reload", async ({ page }) => {
    const input = page.getByPlaceholder("What are you working on?");
    await input.fill("Persisted running task");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    // Reload — the running entry is restored from IndexedDB and the render-time
    // sync must repopulate the description field and keep the timer running.
    await page.reload();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByPlaceholder("What are you working on?")).toHaveValue(
      "Persisted running task"
    );

    // Stopping moves it into the list and clears the bar.
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
    await expect(page.getByPlaceholder("What are you working on?")).toHaveValue("");
    await expect(page.getByText("Persisted running task")).toBeVisible();
  });

  test("in-progress description edits are not clobbered by the running-entry sync", async ({
    page,
  }) => {
    const input = page.getByPlaceholder("What are you working on?");
    await input.fill("Initial text");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    // Reload so the running entry is restored with a stable id (past the
    // optimistic-start id swap). Now editing must not be reverted: the sync
    // keys on the entry id, which no longer changes, so an in-flight debounce
    // write must not clobber the field.
    await page.reload();
    await expect(input).toHaveValue("Initial text");
    await input.fill("Edited while running");
    await page.waitForTimeout(1100);
    await expect(input).toHaveValue("Edited while running");
  });
});
