import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { addManualEntry } from "./entry-helpers";

test.describe("reports charts", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("renders summary + weekly charts with a tracked entry", async ({ page }) => {
    // Seed a tracked entry so the daily chart has data to plot.
    await addManualEntry(page, { description: "Reports smoke entry", start: "09:00", stop: "11:00" });

    await page.goto("/reports");

    // Summary tab: stat tiles + daily bar chart + project donut both mount.
    await expect(page.getByText("Total tracked")).toBeVisible();
    await expect(page.getByText("Daily breakdown")).toBeVisible();
    await expect(page.getByText("Breakdown", { exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="chart"]').first()).toBeVisible();
    expect(await page.locator('[data-slot="chart"]').count()).toBeGreaterThanOrEqual(2);

    // Weekly tab: grouped bar chart mounts with its legend.
    await page.getByRole("tab", { name: "Weekly" }).click();
    const weekly = page.getByRole("tabpanel");
    await expect(weekly.locator('[data-slot="chart"]')).toBeVisible();
    // The weekly chart stacks the two halves of a day's time rather than
    // drawing "total" beside "billable" (billable was always a subset of it).
    await expect(weekly.getByText("Billable", { exact: true })).toBeVisible();
    await expect(weekly.getByText("Non-billable", { exact: true })).toBeVisible();
  });

  test("detailed report: row selection reveals the bulk action bar", async ({ page }) => {
    // Seed an entry so the detailed table has a row to select.
    await addManualEntry(page, { description: "Billable review call", start: "09:00", stop: "10:00" });

    await page.goto("/reports");
    await page.getByRole("tab", { name: "Detailed" }).click();

    // Selecting all rows shows the bulk action bar with billable + delete.
    await page.getByRole("checkbox", { name: "Select all" }).check();
    await expect(page.getByText("1 selected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Non-billable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  test("exposes filters, rounding, saved reports & export formats", async ({ page }) => {
    await page.goto("/reports");

    // Search stays in the toolbar; the five dimension filters live behind one
    // Filters control so the setup for reading a report doesn't crowd out the
    // reading. The billable default is inside it.
    await expect(page.getByPlaceholder("Search description…")).toBeVisible();
    await expect(page.getByText("All entries")).toHaveCount(0);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.getByText("All entries")).toBeVisible();
    await page.keyboard.press("Escape");

    // Toolbar: rounding, metrics, saved reports, export.
    await expect(page.getByRole("button", { name: "Rounding" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose metrics" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

    // Export menu offers CSV, Excel, and Print/PDF.
    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("menuitem", { name: "CSV" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Excel" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Print / PDF" })).toBeVisible();
  });

  test("charts render in dark mode", async ({ page }) => {
    // Seed an entry so the charts have data to plot (empty ranges now show an
    // empty state, not an empty chart).
    await addManualEntry(page, { description: "Dark mode entry", start: "09:00", stop: "11:00" });

    await page.goto("/reports");
    // next-themes stores the choice in localStorage and toggles the .dark class.
    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
      document.documentElement.classList.add("dark");
    });
    await page.reload();
    await expect(page.getByText("Daily breakdown", { exact: true })).toBeVisible();
    await expect(page.locator("html.dark")).toBeVisible();
    await expect(page.locator('[data-slot="chart"]').first()).toBeVisible();
  });
});
