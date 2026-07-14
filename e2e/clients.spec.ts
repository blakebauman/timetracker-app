import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

test.describe("client details", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await page.goto("/clients");
  });

  test("creates a client with contact fields that persist across reload", async ({ page }) => {
    await page.getByRole("button", { name: "New client" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "New Client" })).toBeVisible();
    await dialog.getByPlaceholder("Client name").fill("Acme Corp");
    await dialog.getByPlaceholder("name@example.com").fill("hello@acme.test");
    await dialog.getByPlaceholder("(555) 123-4567").fill("(555) 010-2000");
    await dialog.getByPlaceholder("Street, city, country").fill("1 Rocket Rd");
    await dialog
      .getByPlaceholder("Anything worth remembering about this client")
      .fill("Prefers weekly invoices");
    await dialog.getByRole("button", { name: "Create client" }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByText("Acme Corp")).toBeVisible();

    // Open the detail page and confirm the contact fields round-tripped through the API.
    await page.getByText("Acme Corp").click();
    await page.waitForURL(/\/clients\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Acme Corp" })).toBeVisible();
    await expect(page.getByText("hello@acme.test")).toBeVisible();
    await expect(page.getByText("(555) 010-2000")).toBeVisible();
    await expect(page.getByText("1 Rocket Rd")).toBeVisible();
    await expect(page.getByText("Prefers weekly invoices")).toBeVisible();

    // Reload proves the values were persisted server-side, not just cached.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Acme Corp" })).toBeVisible();
    await expect(page.getByText("hello@acme.test")).toBeVisible();
  });

  test("edits an existing client's details from the row menu", async ({ page }) => {
    await page.getByRole("button", { name: "New client" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Client name").fill("Globex");
    await dialog.getByRole("button", { name: "Create client" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Globex")).toBeVisible();

    // The row wraps a name button plus a more-actions dropdown trigger.
    const row = page
      .getByRole("button", { name: /Globex/ })
      .locator("xpath=..");
    await row.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Edit Client" })).toBeVisible();
    await dialog.getByPlaceholder("name@example.com").fill("ceo@globex.test");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByRole("button", { name: /Globex/ }).click();
    await page.waitForURL(/\/clients\/[^/]+$/);
    await expect(page.getByText("ceo@globex.test")).toBeVisible();
  });
});
