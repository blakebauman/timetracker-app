import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Converting a task into a time entry. The form is the confirmation step —
 * nothing is written until submit — and a task with no estimate must still be
 * convertible, with blank times rather than an invented duration.
 */
async function seed(page: import("@playwright/test").Page) {
  await signUp(page);
  const p = await (await page.request.post("/api/projects", {
    data: { name: "ERP Migration", color: "#e11d48" },
  })).json();
  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: p.id, estimatedSeconds: 7200 },
  });
  await page.request.post("/api/tasks", {
    data: { name: "Data mapping", projectId: p.id },
  });
}

test("a task with an estimate seeds the span", async ({ page }) => {
  await seed(page);
  await page.goto("/tasks");
  await page.waitForLoadState("networkidle");
  // Tasks opens on Today; these are undated, so they live under All.
  await page.getByRole("tab", { name: /^All/ }).click();
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: "Log time to Cutover plan" }).click();
  const sheet = page.getByRole("dialog", { name: "Log time to task" });
  await expect(sheet).toBeVisible();

  // Prefilled from the task and its 2h estimate.
  await expect(sheet.locator("textarea")).toHaveValue("Cutover plan");
  await expect(sheet.getByLabel("Duration")).toHaveValue("02:00:00");

  await sheet.getByRole("button", { name: "Add entry" }).click();
  await expect(sheet).not.toBeVisible();

  await page.goto("/");
  await page.waitForTimeout(1200);
  await expect(page.getByText("Cutover plan").first()).toBeVisible();
});

test("a task with no estimate is still convertible, with blank times", async ({ page }) => {
  await seed(page);
  await page.goto("/tasks");
  await page.waitForLoadState("networkidle");
  // Tasks opens on Today; these are undated, so they live under All.
  await page.getByRole("tab", { name: /^All/ }).click();
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: "Log time to Data mapping" }).click();
  const sheet = page.getByRole("dialog", { name: "Log time to task" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("no estimate")).toBeVisible();

  // Nothing invented: submit stays disabled until a real span is entered.
  await expect(sheet.getByRole("button", { name: "Add entry" })).toBeDisabled();

  const start = sheet.getByRole("textbox", { name: "Start time" });
  await start.fill("09:00");
  await start.press("Enter");
  const stop = sheet.getByRole("textbox", { name: "Stop time" });
  await stop.fill("10:30");
  await stop.press("Enter");
  await expect(sheet.getByLabel("Duration")).toHaveValue("01:30:00");

  // And the task can be closed out in the same step.
  await sheet.getByLabel("Mark task done").click();
  await sheet.getByRole("button", { name: "Add entry" }).click();
  await expect(sheet).not.toBeVisible();

  await page.waitForTimeout(1200);
  await expect(
    page.getByRole("button", { name: "Mark task not done" }).first()
  ).toBeVisible();
});
