import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Calendar grid density regression guard.
 *
 * Split halves the calendar pane while leaving the viewport untouched, so a
 * viewport-based responsive rule left Split rendering seven 65px columns at
 * 1280 — a 230px event label in 46px, gap blocks reading "Tr…". Density is now
 * derived from the pane's own measured width (see lib/calendarDensity.ts).
 *
 * Asserts the pane never renders columns too narrow to carry a label, in the
 * layout that caused the defect.
 */

const MIN_LEGIBLE_COLUMN = 90; // slightly under MIN_DAY_COLUMN to allow borders

async function columnMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const cols = document.querySelectorAll(".fc-col-header-cell");
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

  // Same viewport, half the pane: must reduce rather than squeeze.
  await page.getByRole("tab", { name: "Split", exact: true }).click();
  await page.waitForTimeout(1200);
  const split = await columnMetrics(page);
  expect(split.count).toBeLessThan(7);
  expect(split.width).toBeGreaterThanOrEqual(MIN_LEGIBLE_COLUMN);

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
