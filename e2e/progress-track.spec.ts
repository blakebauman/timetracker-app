import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * A progress bar's track must never be its fill colour.
 *
 * The shared component shipped with a `bg-primary/20` track, which made an
 * *empty* bar read as a full one — `0m / 1h` rendered a full-width red channel,
 * the same shape as a task that had burnt its whole estimate. This asserts the
 * two colours stay distinguishable, in both themes, because the regression is
 * invisible to typecheck and lint and costs nothing to reintroduce.
 */
function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

for (const scheme of ["light", "dark"] as const) {
  test(`an untracked estimate does not render as a full bar (${scheme})`, async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    const project = await (
      await page.request.post("/api/projects", {
        data: { name: "Meridian Rollout", color: "#dd322e" },
        headers: { origin },
      })
    ).json();
    await page.request.post("/api/tasks", {
      data: {
        name: "Not started",
        projectId: project.id,
        estimatedSeconds: 3600,
        dueDate: localDate(0),
      },
      headers: { origin },
    });

    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/tasks");
    await page.waitForTimeout(1000);

    const track = page.locator('[data-slot="progress"]').first();
    await expect(track).toBeVisible();

    const trackBg = await track.evaluate((el) => getComputedStyle(el).backgroundColor);
    const fill = await page
      .locator('[data-slot="progress-indicator"]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(trackBg).not.toBe(fill);
    // …and the track is a neutral, not a tint of the accent: the accent belongs
    // to the running timer and the primary action (DESIGN.md §8).
    expect(trackBg).not.toContain("27.33");
  });
}
