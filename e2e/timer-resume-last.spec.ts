import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// The entry list has a per-row Continue, but the Timer workspace has five views
// and three of them (calendar, timesheet, planner) put no entry row on screen —
// so "start again on what I was just doing" had no affordance there at all.
test("the idle bar can continue the last thing tracked", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await (
    await page.request.post("/api/projects", {
      data: { name: "Retainer", color: "#e11d48", billable: true },
      headers: { origin },
    })
  ).json();

  await page.goto("/");
  const bar = page.locator('header[aria-label="Timer controls"]');
  await bar.waitFor();

  // A brand-new workspace has nothing to continue, so the control stays away
  // rather than sitting there disabled. Scoped to the bar — the entry list has
  // its own per-row "Continue timing this entry".
  await expect(bar.getByRole("button", { name: /^Continue / })).toHaveCount(0);

  await page.request.post("/api/time_entries", {
    data: {
      description: "Discovery workshop prep",
      projectId: project.id,
      start: new Date(Date.now() - 3600_000).toISOString(),
      stop: new Date(Date.now() - 1800_000).toISOString(),
    },
    headers: { origin },
  });
  await page.reload();
  await page.waitForSelector('header[aria-label="Timer controls"]');

  // The accessible name carries the payload — not a bare "Continue".
  const resume = bar.getByRole("button", {
    name: 'Continue "Discovery workshop prep" on Retainer',
  });
  await expect(resume).toBeVisible();
  await resume.click();

  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  await expect(page.getByPlaceholder("What are you working on?")).toHaveValue(
    "Discovery workshop prep"
  );
  // The whole combo comes back, billable included — that entry inherited
  // billable from the project, and continuing it must not quietly drop it.
  await expect
    .poll(async () => {
      const running = await (
        await page.request.get("/api/time_entries?running=true", { headers: { origin } })
      ).json();
      const entry = running[0];
      return entry && { d: entry.description, p: entry.projectName, b: entry.billable };
    })
    .toEqual({ d: "Discovery workshop prep", p: "Retainer", b: true });

  // Idle-only: while running, the slot belongs to Discard.
  await expect(bar.getByRole("button", { name: /^Continue / })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Discard timer" })).toBeVisible();
});
