import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Click-to-create on the calendar grid. This path had no coverage, which made
 * the entry-form unification risky — it's the one creation flow no test drove.
 *
 * Drag-select does NOT finalize under Playwright's synthetic events (see the
 * verify skill); click-to-create is the reliable automation path.
 */
test("creating an entry by clicking an empty calendar slot", async ({ page }) => {
  await signUp(page);
  await page.request.post("/api/projects", {
    data: { name: "Alpha", color: "#e11d48", billable: true },
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.waitForTimeout(1400);

  // Slots are scrolled to ~08:00; target a visible one. Click by coordinates:
  // the day columns are layered over the slot rows, so the slot itself is
  // never the hit target, and a locator click would wait on it forever.
  const slot = (await page.locator(".tt-fc-slot").nth(20).boundingBox())!;
  await page.mouse.click(slot.x + 40, slot.y + 5);

  const form = page.getByRole("dialog", { name: /New entry/i });
  await expect(form).toBeVisible();

  await form.locator("textarea").fill("Slot-created entry");
  await form.getByRole("button", { name: "Add entry" }).click();
  await expect(form).not.toBeVisible();

  await page.getByRole("tab", { name: "List", exact: true }).click();
  await page.waitForTimeout(1200);
  await expect(page.getByText("Slot-created entry")).toBeVisible();
});
