import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { addManualEntry } from "./entry-helpers";

/**
 * The entry list's inline edits — description, duration, project, time range.
 *
 * These all used to run through a row whose React key was `${description}__${projectId}`,
 * so the optimistic patch that applied the edit also changed the key and tore the
 * row down mid-mutation. Everything below is a symptom of that: the acknowledgement
 * never rendered, the edit sheet reopened after saving, and a rename replayed the
 * row's entrance animation as if the entry had just been created.
 */
test.describe("entry list inline editing", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("renaming in place keeps the same row and acknowledges the save", async ({ page }) => {
    await addManualEntry(page, {
      description: "Original description",
      start: "09:00",
      stop: "10:30",
    });

    const row = page.locator("div.group", { hasText: "Original description" }).first();
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Original description" }).click();
    // Re-derived at page level: once the editor is open the text lives in an
    // input's value, so the `hasText` row locator above no longer matches.
    const input = page.getByRole("textbox", { name: "Description" });
    await input.fill("Renamed description");
    await input.press("Enter");

    // The row acknowledges the commit. This is the assertion the old key coupling
    // broke: the row unmounted on the optimistic patch, so the per-mutation
    // onSuccess that raises the tick was dropped with it and nothing was shown.
    await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeAttached();
    await expect(page.getByText("Renamed description")).toBeVisible();

    // Same row, edited — not a new one. The duration is untouched by a rename,
    // so it's a cheap witness that the row survived rather than being rebuilt.
    await expect(
      page.locator("div.group", { hasText: "Renamed description" }).first()
    ).toContainText("1h 30m");
  });

  test("the editor opened from the stop toast closes on save instead of reopening", async ({
    page,
  }) => {
    // The toast path is the one that broke: it opens the editor through the UI
    // store, and the store key was only cleared by a callback on the row — which
    // the save itself unmounted. The store stayed set, so the row that remounted
    // immediately reopened the sheet the user had just dismissed by saving.
    await page.getByPlaceholder("What are you working on?").fill("Toast edit");
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Stop" }).click();

    // Scoped to the toast: the row's own AssignProjectChip carries the same
    // accessible name and would open the project picker instead.
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "no project" });
    await toast.getByRole("button", { name: "Assign project" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    // Editing the description is what used to change the row's key.
    await sheet.locator("textarea").fill("Toast edit renamed");
    await sheet.getByRole("button", { name: "Save changes" }).click();

    await expect(sheet).not.toBeVisible();
    await expect(page.getByText("Toast edit renamed")).toBeVisible();
    // And it must stay closed — the reopen landed a tick after the save.
    await page.waitForTimeout(750);
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("a bulk edit lands optimistically instead of waiting for the round-trip", async ({
    page,
  }) => {
    await addManualEntry(page, { description: "Bulk A", start: "09:00", stop: "10:00" });
    await addManualEntry(page, { description: "Bulk B", start: "11:00", stop: "12:00" });

    // Hold the response well past the assertion window below, so the only way
    // the UI can show the change is optimistically. useBulkUpdateEntries had no
    // onMutate at all — it was the one entry mutation that made you wait.
    await page.route("**/api/time_entries/bulk", async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });

    const rowA = page.locator("div.group", { hasText: "Bulk A" }).first();
    const rowB = page.locator("div.group", { hasText: "Bulk B" }).first();
    await rowA.getByRole("checkbox", { name: "Select entry" }).click();
    await rowB.getByRole("checkbox", { name: "Select entry" }).click();

    await page.getByRole("button", { name: "Mark billable" }).click();

    // Both rows carry the billable marker long before the request comes back.
    await expect(rowA.getByText("Billable")).toBeAttached({ timeout: 1500 });
    await expect(rowB.getByText("Billable")).toBeAttached({ timeout: 1500 });
  });

  test("a rejected time range reports the reason, not a serialized ZodError", async ({ page }) => {
    await addManualEntry(page, { description: "Range reject", start: "09:00", stop: "10:00" });

    const row = page.locator("div.group", { hasText: "Range reject" }).first();
    await row.getByRole("button", { name: /–/ }).click();

    // Start after stop. The request carries both fields, so Hono's zValidator
    // rejects it before the route's own merged-range check — and its body nests
    // the real message two levels deep inside a serialized ZodError.
    const startInput = page.getByRole("textbox", { name: "Start time" });
    await startInput.fill("11:00");
    await startInput.press("Enter");

    const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(errorToast).toHaveText(/Stop time must be after start time/);
    await expect(errorToast).not.toContainText("ZodError");
    // Exactly one: Enter used to commit and then blur-commit again, firing the
    // mutation — and this toast — twice.
    await expect(errorToast).toHaveCount(1);

    // And the row is rolled back, not left showing the rejected value.
    await expect(row).toContainText("1h");
  });

  test("an unparseable duration holds the field open instead of discarding the edit", async ({
    page,
  }) => {
    await addManualEntry(page, { description: "Duration edit", start: "13:00", stop: "14:00" });

    const row = page.locator("div.group", { hasText: "Duration edit" }).first();
    await row.getByRole("button", { name: "1h" }).click();

    const durationInput = row.getByRole("textbox", { name: "Duration" });
    // Clicking seeds the field with the text the row was showing, not a
    // different format.
    await expect(durationInput).toHaveValue("1h");

    await durationInput.fill("not a duration");
    await durationInput.press("Enter");
    // Still open, still marked — the old behaviour closed the field and silently
    // restored the previous duration.
    await expect(durationInput).toBeVisible();
    await expect(durationInput).toHaveAttribute("aria-invalid", "true");

    await durationInput.fill("2h 15m");
    await durationInput.press("Enter");
    await expect(row).toContainText("2h 15m");
  });
});
