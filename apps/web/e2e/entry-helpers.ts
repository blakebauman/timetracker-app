import { expect, type Page, type Locator } from "@playwright/test";

// The Add-entry dialog's Start/Stop fields are TimeOfDayInputs (free-text,
// committed on blur/Enter), not native <input type="time"> — fill then press
// Enter, and wait for the Duration line to confirm the commit registered.
export async function fillTimeRange(dialog: Locator, start: string, stop: string) {
  const startInput = dialog.getByRole("textbox", { name: "Start time" });
  await startInput.fill(start);
  await startInput.press("Enter");
  const stopInput = dialog.getByRole("textbox", { name: "Stop time" });
  await stopInput.fill(stop);
  await stopInput.press("Enter");
}

/** Seed a completed entry for today through the Add-entry dialog. */
export async function addManualEntry(
  page: Page,
  { description, start, stop }: { description: string; start: string; stop: string }
) {
  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill(description);
  await fillTimeRange(dialog, start, stop);
  // The Duration field reflects the committed range (the old standalone
  // "Duration: 1h 30m" line was removed once every form gained the field).
  await expect(dialog.getByLabel("Duration")).not.toHaveValue("00:00:00");
  await dialog.getByRole("button", { name: "Add entry" }).click();
  await dialog.waitFor({ state: "hidden" });
}

/**
 * Pick a date in a DatePicker popover. Day buttons carry
 * data-day={date.toLocaleDateString()} (en-US under Playwright).
 */
export async function pickDate(page: Page, trigger: Locator, date: Date) {
  await trigger.click();
  const key = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  await page.locator(`button[data-day="${key}"]`).click();
}
