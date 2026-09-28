import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Capture and find: the quick-add vocabulary (phrases, estimates, repeats),
 * tasks in the command palette, the All tab's search, and keyboard control of
 * the list.
 */

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The next given weekday from today, today included. */
function nextWeekday(weekday: number) {
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (d.getDay() === weekday) return localDate(i);
  }
  throw new Error("unreachable");
}

type ApiTask = {
  id: string;
  name: string;
  active: boolean;
  dueDate: string | null;
  priority: number;
  estimatedSeconds: number | null;
  recurRule: string | null;
};

async function seed(page: import("@playwright/test").Page) {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await (
    await page.request.post("/api/projects", {
      data: { name: "ERP Migration", color: "#e11d48" },
      headers: { origin },
    })
  ).json();
  const mk = async (data: Record<string, unknown>) =>
    (await page.request.post("/api/tasks", {
      data: { projectId: project.id, ...data },
      headers: { origin },
    })).json() as Promise<ApiTask>;
  const find = async (name: string) =>
    ((await (await page.request.get("/api/tasks?includeInactive=true")).json()) as ApiTask[]).find(
      (t) => t.name === name
    );
  return { project, mk, find };
}

test("quick-add reads a repeat, an estimate and a relative date out of the line", async ({ page }) => {
  const { mk, find } = await seed(page);
  // The line appears once there's a task; one project means no picker either.
  await mk({ name: "Cutover plan", dueDate: localDate(0) });
  await page.goto("/tasks");

  const field = page.getByRole("textbox", { name: "Add a task" });
  await field.fill("Timesheet every fri ~30m p2");
  // The echo says what will be saved before Enter commits it.
  await expect(page.getByText("“Timesheet”", { exact: false })).toBeVisible();
  await expect(page.getByText(/estimate 30m/)).toBeVisible();
  await expect(page.getByText(/every fri/)).toBeVisible();
  await field.press("Enter");

  await expect
    .poll(async () => {
      const t = await find("Timesheet");
      return t && { rule: t.recurRule, est: t.estimatedSeconds, p: t.priority, due: t.dueDate };
    })
    .toEqual({ rule: "weekly:5", est: 1800, p: 2, due: nextWeekday(5) });

  await page.getByRole("tab", { name: /All/ }).click();
  await field.fill("Renew certs in 3 days");
  await field.press("Enter");
  await expect.poll(async () => (await find("Renew certs"))?.dueDate).toBe(localDate(3));
});

test("the command palette finds a task and starts a timer on it", async ({ page }) => {
  const { mk } = await seed(page);
  const task = await mk({
    name: "Data mapping review",
    description: "Customer master and vendor tables",
  });
  await page.goto("/tasks");
  await expect(page.getByRole("tab", { name: /Today/ })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  // Matched by its notes, not its name.
  await page.getByPlaceholder("Search or start a timer…").fill("vendor tables");
  const option = page.getByRole("option", { name: /Data mapping review/ });
  await expect(option).toBeVisible();
  await option.click();

  await expect
    .poll(async () => (await (await page.request.get("/api/time_entries/current")).json())?.taskId)
    .toBe(task.id);
});

test("All's search keeps a matching subtask's parent, and clears", async ({ page }) => {
  const { mk } = await seed(page);
  const parent = await mk({ name: "Data mapping review" });
  await mk({ name: "Vendor master", parentId: parent.id });
  await mk({ name: "Stakeholder sign-off" });
  await page.goto("/tasks");
  await page.getByRole("tab", { name: /All/ }).click();

  await page.getByRole("searchbox", { name: "Search tasks" }).fill("vendor");
  await expect(page.getByText("Data mapping review")).toBeVisible();
  await expect(page.getByText("Vendor master")).toBeVisible();
  await expect(page.getByText("Stakeholder sign-off")).toBeHidden();

  await page.getByRole("searchbox", { name: "Search tasks" }).fill("no such task");
  await expect(page.getByText("Nothing matches “no such task”")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByText("Stakeholder sign-off")).toBeVisible();
});

test("the list is driven from the keyboard", async ({ page }) => {
  const { mk, find } = await seed(page);
  await mk({ name: "Cutover plan", dueDate: localDate(0), priority: 1 });
  await mk({ name: "Stakeholder sign-off", dueDate: localDate(0), priority: 4 });
  await page.goto("/tasks");
  await expect(page.getByText("Stakeholder sign-off")).toBeVisible();

  // J lands on the first row, J again on the second.
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expect(page.locator("[data-task-row]:focus")).toContainText("Stakeholder sign-off");

  // 2 sets priority on the focused row.
  await page.keyboard.press("2");
  await expect.poll(async () => (await find("Stakeholder sign-off"))?.priority).toBe(2);

  // E opens the edit dialog on it.
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog", { name: "Edit task" })).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Name")).toHaveValue("Stakeholder sign-off");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // K back up, X completes it.
  await page.locator('[data-task-row]').filter({ hasText: "Stakeholder sign-off" }).focus();
  await page.keyboard.press("k");
  await page.keyboard.press("x");
  await expect.poll(async () => (await find("Cutover plan"))?.active).toBe(false);

  // Q jumps to the capture line.
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("q");
  await expect(page.getByRole("textbox", { name: "Add a task" })).toBeFocused();
});

test("Alt+Shift+T opens Tasks ready to type from anywhere", async ({ page }) => {
  const { mk } = await seed(page);
  await mk({ name: "Cutover plan", dueDate: localDate(0) });
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

  await page.keyboard.press("Alt+Shift+T");
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole("textbox", { name: "Add a task" })).toBeFocused();
});

test("? opens the shortcut reference, which lists the task keys", async ({ page }) => {
  await signUp(page);
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page.keyboard.press("Shift+Slash");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Complete or reopen the task")).toBeVisible();
});
