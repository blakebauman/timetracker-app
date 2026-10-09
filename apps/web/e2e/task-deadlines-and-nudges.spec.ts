import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Deadlines (when a task must be done, as opposed to when it's planned) and
 * the plan side of the Assistant's nudges: overdue tasks and close deadlines.
 */

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type ApiTask = {
  id: string;
  name: string;
  active: boolean;
  dueDate: string | null;
  deadlineDate: string | null;
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
  const put = (id: string, data: Record<string, unknown>) =>
    page.request.put(`/api/tasks/${id}`, { data, headers: { origin } });
  const all = async () =>
    (await (await page.request.get("/api/tasks?includeInactive=true")).json()) as ApiTask[];
  return { mk, put, all };
}

test("`by …` in quick-add sets a deadline, shown on the row", async ({ page }) => {
  const { mk, all } = await seed(page);
  await mk({ name: "Cutover plan", dueDate: localDate(0) });
  await page.goto("/tasks");
  await page.getByRole("tab", { name: /All/ }).click();

  const field = page.getByRole("textbox", { name: "Add a task" });
  await field.fill("Quarterly report by in 2 days");
  await expect(page.getByText(/deadline/)).toBeVisible();
  await field.press("Enter");

  await expect
    .poll(async () => (await all()).find((t) => t.name === "Quarterly report")?.deadlineDate)
    .toBe(localDate(2));
  // Two days out is inside the warning horizon.
  await expect(page.getByLabel(/^Deadline /).first()).toBeVisible();
  await expect(page.getByText(/^by /).first()).toBeVisible();
});

test("the dialog sets and clears a deadline", async ({ page }) => {
  const { mk, all } = await seed(page);
  await mk({ name: "Stakeholder sign-off", dueDate: localDate(0), deadlineDate: localDate(5) });
  await page.goto("/tasks");

  await page.getByRole("button", { name: "More actions for Stakeholder sign-off" }).click();
  await page.getByRole("menuitem", { name: "Edit task…" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await dialog.getByRole("button", { name: "Clear deadline" }).click();
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(async () => (await all())[0].deadlineDate).toBeNull();
});

test("a repeating task's next deadline keeps the same lead over its due date", async ({ page }) => {
  const { mk, put, all } = await seed(page);
  const t = await mk({
    name: "Weekly report",
    dueDate: localDate(0),
    deadlineDate: localDate(3),
    recurRule: "daily",
  });
  await put(t.id, { active: false, completedOn: localDate(0) });

  const next = (await all()).find((x) => x.active);
  expect(next).toMatchObject({ dueDate: localDate(1), deadlineDate: localDate(4) });
});

test("the Assistant nudges about overdue tasks and a close deadline", async ({ page }) => {
  const { mk } = await seed(page);
  await mk({ name: "Slipped task", dueDate: localDate(-3) });
  await mk({ name: "Another slipped", dueDate: localDate(-1) });
  await mk({ name: "Quarterly report", dueDate: localDate(0), deadlineDate: localDate(1), estimatedSeconds: 7200 });
  await mk({ name: "Far away", deadlineDate: localDate(30) });

  const offset = new Date().getTimezoneOffset();
  const nudges = (await (
    await page.request.get(`/api/assistant/nudges?timezoneOffsetMinutes=${offset}`)
  ).json()) as { kind: string; title: string; body: string }[];

  const overdue = nudges.find((n) => n.kind === "tasks_overdue");
  expect(overdue?.title).toBe("2 tasks are overdue");
  const deadlines = nudges.filter((n) => n.kind === "deadline_risk");
  expect(deadlines).toHaveLength(1);
  expect(deadlines[0].body).toContain("Quarterly report");
  expect(deadlines[0].body).toContain("tomorrow");
  expect(deadlines[0].body).toContain("2h");

  // In the panel, a task nudge points at the task list.
  await page.goto("/projects");
  await page.getByRole("button", { name: /^Assistant — \d+ new nudges?$/ }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("2 tasks are overdue")).toBeVisible();
  await panel.getByRole("button", { name: "Open tasks" }).first().click();
  await expect(page).toHaveURL(/\/tasks$/);
});

test("a late task the deadline nudge already names isn't counted again as overdue", async ({ page }) => {
  const { mk } = await seed(page);
  // Planned for two days ago *and* due by yesterday: one fact, one card.
  await mk({ name: "Board pack", dueDate: localDate(-2), deadlineDate: localDate(-1) });

  const offset = new Date().getTimezoneOffset();
  const get = async () =>
    (await (
      await page.request.get(`/api/assistant/nudges?timezoneOffsetMinutes=${offset}`)
    ).json()) as { kind: string; title: string }[];

  let nudges = await get();
  expect(nudges.filter((n) => n.kind === "deadline_risk")).toHaveLength(1);
  expect(nudges.find((n) => n.kind === "tasks_overdue")).toBeUndefined();

  // A second slipped task with no deadline is still news — counted as the other one.
  await mk({ name: "Expense claims", dueDate: localDate(-1) });
  nudges = await get();
  expect(nudges.find((n) => n.kind === "tasks_overdue")?.title).toBe("Another task is overdue");
});
