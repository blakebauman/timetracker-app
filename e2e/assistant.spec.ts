import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// Aski, the assistant: deterministic nudges from timer/timesheet state, the
// global launcher in the timer bar, and the right-side panel. Calendar-driven
// nudges need a Google connection so they aren't exercised here; the
// long_timer nudge covers the full nudge pipeline end to end.
test("Aski surfaces a long-running-timer nudge and dismisses it", async ({ page }) => {
  await signUp(page);

  // Leave the app before seeding: the open page would otherwise consume the
  // nudge the moment its query refetches (toast + persisted seen-marker),
  // making the post-navigation toast assertion racy.
  await page.goto("about:blank");

  // Seed a running timer started 5h ago — past the 4h long_timer threshold.
  const start = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const created = await page.request.post("/api/time_entries", {
    data: { description: "Deep focus block", start },
  });
  expect(created.ok()).toBeTruthy();

  // API: the nudges endpoint computes the long_timer nudge.
  const res = await page.request.get(
    `/api/assistant/nudges?timezoneOffsetMinutes=${new Date().getTimezoneOffset()}`
  );
  expect(res.ok()).toBeTruthy();
  const nudges = await res.json();
  const longTimer = nudges.find((n: { kind: string }) => n.kind === "long_timer");
  expect(longTimer).toBeTruthy();
  expect(longTimer.body).toContain("Deep focus block");

  // UI: loading the app with a fresh nudge proactively toasts it, and the
  // launcher badge shows the count.
  await page.goto("/");
  const nudgeToast = page.locator("[data-sonner-toast]");
  await expect(nudgeToast).toContainText("Timer still running");

  // Scoped to the timer bar — the toast's action button is also named "Open Aski".
  const launcher = page.locator("header").getByRole("button", { name: /Open Aski/ });
  await expect(launcher).toBeVisible();
  await expect(launcher).toHaveAccessibleName(/\d+ nudge/);

  // The toast carries an Open Aski action; open the panel via the launcher
  // (clicking the toast itself would race its auto-dismiss timer).
  await expect(nudgeToast.getByRole("button", { name: "Open Aski" })).toBeVisible();
  await launcher.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toContainText("Aski");
  await expect(panel.getByText("Timer still running")).toBeVisible();
  await expect(page.getByPlaceholder("Ask Aski…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();

  // Dismissal hides the nudge and persists client-side.
  await panel.getByRole("button", { name: "Dismiss nudge" }).first().click();
  await expect(panel.getByText("Timer still running")).toBeHidden();
  await expect(panel.getByText(/All caught up/)).toBeVisible();

  // After a reload the nudge stays dismissed — no card, and no re-toast (both
  // the dismissal and the seen-marker persist per browser).
  await page.reload();
  await page.locator("header").getByRole("button", { name: "Open Aski" }).click();
  const reopened = page.getByRole("dialog");
  await expect(reopened).toContainText("Aski");
  await expect(reopened.getByText("Timer still running")).toBeHidden();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});

// AI project inference is best-effort and unavailable in CI — this exercises
// the fallback path: the entry must still materialize, just uncategorized.
test("track-event materializes a meeting idempotently", async ({ page }) => {
  await signUp(page);

  const start = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const stop = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const body = { calendarEventId: "evt-e2e-track", title: "Design sync", start, stop };

  const first = await page.request.post("/api/assistant/track-event", { data: body });
  expect(first.ok()).toBeTruthy();
  expect((await first.json()).created).toBe(true);

  // Same event again (double-click / auto-track race) must not duplicate.
  const second = await page.request.post("/api/assistant/track-event", { data: body });
  expect((await second.json()).created).toBe(false);

  await page.reload();
  await expect(page.getByText("Design sync")).toBeVisible();
});
