import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The plan beside the actual: the Timer workspace carries today's plan as a
 * standing column (a sheet below lg), flags a plan the day passed by until it
 * is acted on, plans the day without the chat, and offers the next task from
 * the idle timer strip.
 */

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function minuteNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

type ApiTask = { id: string; name: string; dueDate: string | null; scheduledMinute: number | null };

async function seed(page: import("@playwright/test").Page) {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await (
    await page.request.post("/api/projects", {
      data: { name: "ERP Migration", color: "#2563eb" },
      headers: { origin },
    })
  ).json();
  const mk = async (data: Record<string, unknown>) =>
    (await page.request.post("/api/tasks", {
      data: { projectId: project.id, ...data },
      headers: { origin },
    })).json() as Promise<ApiTask>;
  const all = async () =>
    (await (await page.request.get("/api/tasks?includeInactive=true")).json()) as ApiTask[];
  return { origin, project, mk, all };
}

test("the plan stands beside the list: overdue, today and the week ahead", async ({ page }) => {
  const { mk } = await seed(page);
  await mk({ name: "Late cutover note", dueDate: localDate(-2) });
  await mk({ name: "Data mapping review", dueDate: localDate(0), estimatedSeconds: 3600 });
  await mk({ name: "Steerco deck", dueDate: localDate(3) });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");

  const plan = page.getByRole("complementary", { name: "Today's plan" });
  await expect(plan).toBeVisible();
  await expect(plan.getByRole("region", { name: "Overdue" })).toContainText("Late cutover note");
  await expect(plan.getByRole("region", { name: "Today" })).toContainText("Data mapping review");
  await expect(plan).toContainText("Steerco deck");
  // The estimate still to do, beside the day.
  await expect(plan).toContainText("1h left today");

  // Folding it keeps a strip with the count, and the choice survives a reload.
  await plan.getByRole("button", { name: "Hide today's plan" }).click();
  await expect(plan).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show today's plan" })).toBeVisible();
  await page.getByRole("button", { name: "Show today's plan" }).click();
  await expect(plan).toBeVisible();
});

test("a block the day passed by stays flagged until dismissed", async ({ page }) => {
  const now = minuteNow();
  test.skip(now < 120, "needs a block that has ended earlier today");
  const { mk } = await seed(page);
  await mk({
    name: "Vendor call prep",
    dueDate: localDate(0),
    scheduledMinute: now - 90,
    estimatedSeconds: 30 * 60,
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");

  const plan = page.getByRole("complementary", { name: "Today's plan" });
  await expect(plan.getByText(/^Not started — planned/)).toBeVisible();

  // The grid says it too, on the block itself.
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".tt-event-missed")).toHaveCount(1);
  await expect(page.locator(".tt-event-missed")).toContainText("Not started");

  await plan.getByRole("button", { name: /^Dismiss: Not started/ }).click();
  await expect(plan.getByText(/^Not started — planned/)).toHaveCount(0);
  await expect(page.locator(".tt-event-missed")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".tt-event-planned")).toHaveCount(1);
  await expect(page.locator(".tt-event-missed")).toHaveCount(0);
});

test("tracking past the estimate is flagged on the task", async ({ page }) => {
  const { origin, project, mk } = await seed(page);
  const task = await mk({ name: "Interface spec", dueDate: localDate(0), estimatedSeconds: 15 * 60 });
  const stop = new Date();
  const start = new Date(stop.getTime() - 40 * 60_000);
  const res = await page.request.post("/api/time_entries", {
    headers: { origin },
    data: {
      description: "Interface spec",
      projectId: project.id,
      taskId: task.id,
      start: start.toISOString(),
      stop: stop.toISOString(),
    },
  });
  expect(res.ok()).toBeTruthy();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");

  const plan = page.getByRole("complementary", { name: "Today's plan" });
  await expect(plan.getByText("Over estimate by 25m")).toBeVisible();
});

test("plan my day proposes times, schedules on confirm, and undoes", async ({ page }) => {
  // The plan fits the rest of 09:00–17:30; late in the day nothing fits.
  test.skip(minuteNow() > 16 * 60, "too late in the working day to place a task");
  const { mk, all } = await seed(page);
  await mk({ name: "Write test plan", dueDate: localDate(0), estimatedSeconds: 30 * 60 });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");

  const plan = page.getByRole("complementary", { name: "Today's plan" });
  await plan.getByRole("button", { name: "Plan my day" }).click();
  const proposal = page.getByRole("dialog");
  await expect(proposal).toContainText("Write test plan");
  await proposal.getByRole("button", { name: "Schedule 1 task" }).click();

  await expect.poll(async () => (await all())[0].scheduledMinute).not.toBeNull();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await all())[0].scheduledMinute).toBeNull();
});

test("the idle timer offers the next planned task", async ({ page }) => {
  const { origin, mk } = await seed(page);
  await mk({ name: "Reconcile GL extract", dueDate: localDate(0) });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");

  const bar = page.locator('header[aria-label="Timer controls"]');
  await bar.getByRole("button", { name: 'Start next task "Reconcile GL extract" on ERP Migration' }).click();
  await expect(page.getByRole("button", { name: "Stop timer", exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const running = await (
        await page.request.get("/api/time_entries?running=true", { headers: { origin } })
      ).json();
      return running[0]?.description;
    })
    .toBe("Reconcile GL extract");
});

test("below lg the plan opens as a sheet from the header", async ({ page }) => {
  const { mk } = await seed(page);
  await mk({ name: "Sign-off checklist", dueDate: localDate(0) });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");

  await expect(page.getByRole("complementary", { name: "Today's plan" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Today's plan, 1 task/ }).click();
  await expect(page.getByRole("dialog", { name: "Plan" })).toContainText("Sign-off checklist");
});
