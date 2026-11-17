import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Calendar grid density regression guard.
 *
 * The plan column narrows the calendar pane while leaving the viewport
 * untouched (as the retired Split view once halved it), so a viewport-based
 * responsive rule rendered seven columns too narrow for a label — a 230px event
 * label in 46px, gap blocks reading "Tr…". Density is derived from the pane's
 * own measured width (see lib/calendarDensity.ts).
 *
 * Asserts the pane never renders columns too narrow to carry a label, in the
 * layout that caused the defect.
 */

const MIN_LEGIBLE_COLUMN = 90; // slightly under MIN_DAY_COLUMN to allow borders

async function columnMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const cols = document.querySelectorAll(".tt-fc-day-header");
    return {
      count: cols.length,
      width: cols[0] ? Math.round(cols[0].getBoundingClientRect().width) : 0,
    };
  });
}

test("calendar density follows the pane, not the viewport", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // Full-width calendar at desktop keeps the full week.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.waitForTimeout(1200);
  const full = await columnMetrics(page);
  expect(full.count).toBe(7);
  expect(full.width).toBeGreaterThanOrEqual(MIN_LEGIBLE_COLUMN);

  // At lg the plan column still stands beside the grid and leaves the pane a
  // fraction of the viewport: must reduce rather than squeeze.
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.waitForTimeout(1200);
  const narrowed = await columnMetrics(page);
  expect(narrowed.count).toBeLessThan(7);
  expect(narrowed.width).toBeGreaterThanOrEqual(MIN_LEGIBLE_COLUMN);

  // The reduction is explained rather than silently contradicting the picker.
  await page.getByRole("button", { name: "View options" }).click();
  await expect(page.getByText(/the pane is too narrow for/i)).toBeVisible();
  await page.keyboard.press("Escape");

  // Phone: one column, still legible.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.waitForTimeout(1200);
  const phone = await columnMetrics(page);
  expect(phone.count).toBe(1);
  expect(phone.width).toBeGreaterThanOrEqual(MIN_LEGIBLE_COLUMN);
});
