import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

test.describe("entry delete", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("deletes an entry via its row menu (with exit animation)", async ({ page }) => {
    // Seed an entry.
    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").fill("Entry to delete");
    const [s, e] = await dialog.locator('input[type="time"]').all();
    await s.fill("09:00");
    await e.fill("10:00");
    await dialog.getByRole("button", { name: "Add entry" }).click();
    await dialog.waitFor({ state: "hidden" });

    const row = page.getByText("Entry to delete");
    await expect(row).toBeVisible();

    // Open the row's action menu and delete.
    await row.hover();
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    // The row plays its exit animation, then is removed; an undo toast appears.
    await expect(page.getByText("Entry deleted")).toBeVisible();
    await expect(page.getByText("Entry to delete")).toHaveCount(0);
  });
});
