import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

test.describe("manual one-off time entry", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("adds an entry with a start and stop time", async ({ page }) => {
    await page.getByRole("button", { name: "Add entry" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Add entry" })).toBeVisible();

    await dialog.locator("textarea").fill("Manual test entry");

    const [startTime, stopTime] = await dialog.locator('input[type="time"]').all();
    await startTime.fill("09:00");
    await stopTime.fill("10:30");

    await expect(dialog.getByText("Duration: 1h 30m")).toBeVisible();
    const saveButton = dialog.getByRole("button", { name: "Add entry" });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Manual test entry")).toBeVisible();
  });

  test("disables save when stop is before start", async ({ page }) => {
    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");

    const [startTime, stopTime] = await dialog.locator('input[type="time"]').all();
    await startTime.fill("10:00");
    await stopTime.fill("09:00");

    await expect(dialog.getByText("Stop time must be after start time.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add entry" })).toBeDisabled();
  });

  test("does not affect a currently running timer", async ({ page }) => {
    // Start the timer via the running-timer bar on the Timer page.
    await page.getByPlaceholder("What are you working on?").fill("Running task");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").fill("Yesterday's work");
    await dialog.locator('input[type="date"]').fill(
      new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    );
    const [startTime, stopTime] = await dialog.locator('input[type="time"]').all();
    await startTime.fill("09:00");
    await stopTime.fill("10:00");
    await dialog.getByRole("button", { name: "Add entry" }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByText("Yesterday's work")).toBeVisible();
    // Running timer should still be running, untouched by the one-off entry.
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  });
});
