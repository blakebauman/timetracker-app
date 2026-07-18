import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// Aski, the assistant: deterministic nudges from timer/timesheet state, the
// global launcher in the timer bar, and the right-side panel. Calendar-driven
// nudges need a Google connection so they aren't exercised here; the
// long_timer nudge covers the full nudge pipeline end to end.
test("Aski surfaces a long-running-timer nudge and dismisses it", async ({ page }) => {
  await signUp(page);

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

  // UI: launcher badge reflects the nudge; the panel shows it.
  await page.reload();
  const launcher = page.getByRole("button", { name: /Open Aski/ });
  await expect(launcher).toBeVisible();
  await expect(launcher).toHaveAccessibleName(/\d+ nudge/);

  await launcher.click();
  await expect(page.getByRole("dialog")).toContainText("Aski");
  await expect(page.getByText("Timer still running")).toBeVisible();
  await expect(page.getByPlaceholder("Ask Aski…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();

  // Dismissal hides the nudge and persists client-side.
  await page.getByRole("button", { name: "Dismiss nudge" }).first().click();
  await expect(page.getByText("Timer still running")).toBeHidden();
  await expect(page.getByText(/All caught up/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Open Aski" }).click();
  await expect(page.getByRole("dialog")).toContainText("Aski");
  await expect(page.getByText("Timer still running")).toBeHidden();
});
