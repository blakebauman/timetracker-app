import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { fillTimeRange, pickDate } from "./entry-helpers";

test.describe("manual one-off time entry", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("adds an entry with a start and stop time", async ({ page }) => {
    await page.getByRole("button", { name: "Add entry" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Add entry" })).toBeVisible();

    await dialog.locator("textarea").fill("Manual test entry");

    await fillTimeRange(dialog, "09:00", "10:30");

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

    await fillTimeRange(dialog, "10:00", "09:00");

    await expect(dialog.getByText("Stop time must be after start time.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add entry" })).toBeDisabled();
  });

  test("does not affect a currently running timer", async ({ page }) => {
    // Start the timer via the running-timer bar on the Timer page.
    await page.getByPlaceholder("What are you working on?").fill("Running task");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    await page.getByRole("button", { name: "Add entry" }).click();
    // Scoped by name: the DatePicker popover used below also has role=dialog.
    const dialog = page.getByRole("dialog", { name: "Add entry" });
    await dialog.locator("textarea").fill("Yesterday's work");
    // The Date field is a popover DatePicker now — its trigger shows the
    // formatted current date (the only button in the dialog with a year in it).
    await pickDate(
      page,
      dialog.getByRole("button", { name: /\d{4}/ }),
      new Date(Date.now() - 86_400_000)
    );
    await fillTimeRange(dialog, "09:00", "10:00");
    await dialog.getByRole("button", { name: "Add entry" }).click();
    await expect(dialog).not.toBeVisible();

    // The entry landed on yesterday, so it's outside the Today list — the day
    // header for yesterday should now show it.
    await expect(page.getByText("Yesterday's work")).toBeVisible();
    // Running timer should still be running, untouched by the one-off entry.
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  });
});
