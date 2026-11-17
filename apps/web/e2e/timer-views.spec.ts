import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The Timer hosts three views. Split and Planner were retired: a saved choice
 * of either lands on its nearest survivor, and the plan is a mode of the
 * Timesheet. Drafting the day starts from the Add menu.
 */

test("three views; the timesheet holds the plan as a mode", async ({ page }) => {
  await signUp(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const views = page.getByRole("tablist", { name: "Timer view" }).getByRole("tab");
  await expect(views).toHaveCount(3);

  await page.getByRole("tab", { name: "Timesheet", exact: true }).click();
  const mode = page.getByRole("radiogroup", { name: "Timesheet shows" });
  await expect(mode.getByRole("radio", { name: "Logged" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Copy last week" })).toBeVisible();

  await mode.getByRole("radio", { name: "Plan" }).click();
  await expect(page.getByRole("button", { name: "Copy last week's plan" })).toBeVisible();

  // The mode is a timesheet control; other views don't show it.
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(mode).toBeHidden();
});

test("a saved Split or Planner view lands on its survivor", async ({ page }) => {
  await signUp(page);
  for (const [saved, tab, plan] of [
    ["split", "Calendar", false],
    ["planner", "Timesheet", true],
  ] as const) {
    await page.evaluate((v) => {
      const raw = localStorage.getItem("time-tracker-ui");
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
      parsed.state.timerView = v;
      parsed.state.timesheetMode = "logged";
      localStorage.setItem("time-tracker-ui", JSON.stringify(parsed));
    }, saved);
    await page.reload();
    await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    if (plan) {
      await expect(
        page.getByRole("radiogroup", { name: "Timesheet shows" }).getByRole("radio", { name: "Plan" })
      ).toBeChecked();
    }
  }
});

test("drafting the day starts from the Add menu", async ({ page }) => {
  await signUp(page);
  // Nothing to review: the header carries no drafting control of its own.
  await expect(page.getByRole("button", { name: /^Review \d+ drafts$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "More ways to add" }).click();
  await expect(page.getByRole("menuitem", { name: "Draft today" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Quick add/ })).toBeVisible();
});

test("an overdue task doesn't toast beside the plan column that lists it", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await (
    await page.request.post("/api/projects", { data: { name: "ERP Migration", color: "#2563eb" }, headers: { origin } })
  ).json();
  const d = new Date();
  d.setDate(d.getDate() - 2);
  const p = (n: number) => String(n).padStart(2, "0");
  await page.request.post("/api/tasks", {
    data: { projectId: project.id, name: "Late cutover note", dueDate: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` },
    headers: { origin },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const plan = page.getByRole("complementary", { name: "Today's plan" });
  await expect(plan.getByRole("region", { name: "Overdue" })).toContainText("Late cutover note");
  // The nudge exists — the rail counts it — but the column already says it.
  await expect(page.getByRole("button", { name: /^Assistant — \d+ new nudges?$/ }).first()).toBeVisible();
  await expect(page.getByText("A task is overdue")).toHaveCount(0);
});
