import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Local 'YYYY-MM-DD' for today, and UTC instants for a local clock time on it.
 * Drafts are keyed to the user's local day, so the seeded entries have to land
 * on the same day the app is looking at.
 */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function atLocalHour(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

test("drafts: an uncovered gap becomes a proposal, reviewed and confirmed", async ({
  page,
}) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;

  // Two entries with a 90-minute hole between them. Both must be in the past —
  // nothing that hasn't happened yet is ever drafted.
  const now = new Date();
  const base = Math.min(now.getHours() - 4, 9);
  test.skip(base < 1, "Too early in the local day to seed a past gap");

  for (const [startHour, stopHour] of [
    [base, base + 1],
    [base + 2.5, base + 3.5],
  ]) {
    const res = await page.request.post("/api/time_entries", {
      headers: { origin },
      data: {
        description: `seed ${startHour}`,
        start: atLocalHour(Math.floor(startHour), (startHour % 1) * 60),
        stop: atLocalHour(Math.floor(stopHour), (stopHour % 1) * 60),
      },
    });
    expect(res.ok()).toBeTruthy();
  }

  // Drafting is deterministic about *what* it proposes; only the wording is
  // AI-assisted, and that step is allowed to fail (it does in CI, where the AI
  // binding has no credentials). The proposal itself must appear either way.
  const generated = await page.request.post("/api/drafts/generate", {
    headers: { origin },
    data: { date: localToday(), timezoneOffsetMinutes: new Date().getTimezoneOffset() },
  });
  expect(generated.ok()).toBeTruthy();
  const body = (await generated.json()) as { drafts: { source: string }[] };
  expect(body.drafts.length).toBeGreaterThan(0);
  expect(body.drafts.some((d) => d.source === "gap")).toBeTruthy();

  // The header button flips from "Draft day" to "Review N" once proposals exist.
  await page.reload();
  const reviewButton = page.getByRole("button", { name: /Review \d+/ });
  await expect(reviewButton).toBeVisible();
  await reviewButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Each card explains itself — that line is the whole reason review is
  // trustworthy rather than a rubber stamp.
  await expect(dialog.getByText(/isn't accounted for/)).toBeVisible();

  // Step through every card, then the total card confirms the batch.
  const keep = dialog.getByRole("button", { name: "Keep" });
  while (await keep.isVisible().catch(() => false)) {
    await keep.click();
  }
  await expect(dialog.getByText("How much time should we report?")).toBeVisible();
  await dialog.getByRole("button", { name: /Add \d+ to timesheet/ }).click();
  await expect(dialog).toBeHidden();

  // Confirmed drafts are real entries now, and nothing is left to review.
  const remaining = await page.request.get(`/api/drafts?date=${localToday()}`);
  expect(await remaining.json()).toEqual([]);
});

test("drafts: proposals never count as tracked time until confirmed", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;

  const now = new Date();
  const base = Math.min(now.getHours() - 4, 9);
  test.skip(base < 1, "Too early in the local day to seed a past gap");

  for (const [startHour, stopHour] of [
    [base, base + 1],
    [base + 2.5, base + 3.5],
  ]) {
    await page.request.post("/api/time_entries", {
      headers: { origin },
      data: {
        description: `seed ${startHour}`,
        start: atLocalHour(Math.floor(startHour), (startHour % 1) * 60),
        stop: atLocalHour(Math.floor(stopHour), (stopHour % 1) * 60),
      },
    });
  }

  const before = await (
    await page.request.get(
      `/api/reports/summary?since=${localToday()}T00:00:00.000Z&until=${localToday()}T23:59:59.999Z`
    )
  ).json();

  await page.request.post("/api/drafts/generate", {
    headers: { origin },
    data: { date: localToday(), timezoneOffsetMinutes: new Date().getTimezoneOffset() },
  });

  const after = await (
    await page.request.get(
      `/api/reports/summary?since=${localToday()}T00:00:00.000Z&until=${localToday()}T23:59:59.999Z`
    )
  ).json();

  // This is the guarantee the separate drafts table exists to make: a proposal
  // is not time, and no report may see it before a person confirms it.
  expect(after.totalSeconds).toBe(before.totalSeconds);
});
