import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// A fixed timezone west of UTC: the local date and the UTC date differ for
// everything tracked after 18:00, which is what the day-key bucketing has to
// survive. Pinned so the assertions mean the same thing on a UTC CI runner.
test.use({ timezoneId: "America/Denver" });

test.describe("day boundaries in the Timer list", () => {
  test("time tracked after midnight survives Stop in a tab opened yesterday", async ({
    page,
  }) => {
    // 23:40 local, i.e. before midnight — where a long-running tab resolves its
    // "Today" range from.
    await page.clock.install({ time: new Date("2026-08-14T05:40:00.000Z") });
    await signUp(page);

    await page.getByRole("tab", { name: "List" }).click();
    await page.getByRole("button", { name: "Date range" }).click();
    await page.getByRole("menuitem", { name: "Today", exact: true }).click();

    // The tab stays open across midnight — nothing reloads.
    await page.clock.fastForward("45:00");

    const list = page.getByRole("tabpanel");
    const input = page.getByPlaceholder("What are you working on?");
    await input.fill("After midnight task");
    await page.getByRole("button", { name: "Start timer" }).click();
    await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
    await expect(list.getByText("After midnight task")).toBeVisible();

    // The regression: the list was still querying yesterday's window, so the
    // refetch after Stop dropped the entry the optimistic patch had put there
    // and only a manual reload brought it back. Assert past that refetch, not
    // on the optimistic frame that precedes it.
    const refetched = page.waitForResponse(
      (r) => r.url().includes("/api/time_entries?") && r.request().method() === "GET"
    );
    await page.getByRole("button", { name: "Stop timer" }).click();
    await expect(page.getByRole("button", { name: "Start timer" })).toBeVisible();
    await refetched;
    await expect(list.getByText("After midnight task")).toBeVisible();
    await expect(list.getByText("Today", { exact: true })).toBeVisible();
  });

  test("an evening entry is grouped under Today, not tomorrow's date", async ({ page }) => {
    // 20:30 local on Aug 13 — already Aug 14 in UTC.
    await page.clock.install({ time: new Date("2026-08-14T02:30:00.000Z") });
    await signUp(page);
    const origin = new URL(page.url()).origin;

    const res = await page.request.post("/api/time_entries", {
      // 20:00–20:15 local, both stamped on Aug 14 in UTC.
      data: {
        description: "Evening task",
        start: "2026-08-14T02:00:00.000Z",
        stop: "2026-08-14T02:15:00.000Z",
        billable: false,
        tags: [],
      },
      headers: { origin },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/");
    await page.getByRole("tab", { name: "List" }).click();
    const list = page.getByRole("tabpanel");
    await expect(list.getByText("Evening task")).toBeVisible();
    await expect(list.getByText("Today", { exact: true })).toBeVisible();
    await expect(list.getByText("Friday, Aug 14")).toHaveCount(0);
  });
});
