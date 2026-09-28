import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The Board tab: To do / In progress / Done. Stage is `active` + `startedAt`;
 * time logged against a task starts it, and a drag or the ⋯ menu moves it.
 */

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type ApiTask = { id: string; name: string; active: boolean; startedAt: string | null };

async function seed(page: import("@playwright/test").Page) {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const post = async (url: string, data: Record<string, unknown>) =>
    (await page.request.post(url, { data, headers: { origin } })).json();
  const project = await post("/api/projects", { name: "ERP Migration", color: "#e11d48" });
  const mk = (data: Record<string, unknown>) =>
    post("/api/tasks", { projectId: project.id, ...data }) as Promise<ApiTask>;
  const find = async (name: string) =>
    ((await (await page.request.get("/api/tasks?includeInactive=true")).json()) as ApiTask[]).find(
      (t) => t.name === name
    );
  return { project, post, mk, find };
}

const column = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("region", { name });

const card = (page: import("@playwright/test").Page, name: string) =>
  page
    .getByRole("button", { name: `Start timer for ${name}` })
    .locator("xpath=ancestor::*[@draggable='true'][1]");

test("time logged against a task moves it to In progress on its own", async ({ page }) => {
  const { project, post, mk } = await seed(page);
  const task = await mk({ name: "Data mapping review", dueDate: localDate(1) });
  await mk({ name: "Draft cutover runbook" });
  const stop = new Date(Date.now() - 3600e3).toISOString();
  const start = new Date(Date.now() - 7200e3).toISOString();
  await post("/api/time_entries", {
    description: "Mapping",
    projectId: project.id,
    taskId: task.id,
    start,
    stop,
  });

  await page.goto("/tasks");
  await page.getByRole("tab", { name: "Board, 1 in progress" }).click();
  await expect(column(page, "In progress").getByText("Data mapping review")).toBeVisible();
  await expect(column(page, "To do").getByText("Draft cutover runbook")).toBeVisible();
});

test("dragging a card through the columns starts, finishes and reopens it", async ({ page }) => {
  const { mk, find } = await seed(page);
  await mk({ name: "Draft cutover runbook" });
  await page.goto("/tasks");
  await page.getByRole("tab", { name: /Board/ }).click();
  await expect(column(page, "To do").getByText("Draft cutover runbook")).toBeVisible();

  await card(page, "Draft cutover runbook").dragTo(column(page, "In progress"));
  await expect(column(page, "In progress").getByText("Draft cutover runbook")).toBeVisible();
  await expect.poll(async () => (await find("Draft cutover runbook"))?.startedAt).not.toBeNull();

  // Done goes through the same path as the checkbox: completed, with Undo.
  await card(page, "Draft cutover runbook").dragTo(column(page, "Done"));
  await expect(column(page, "Done").getByText("Draft cutover runbook")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect.poll(async () => (await find("Draft cutover runbook"))?.active).toBe(false);

  // Back to To do reopens it and clears the start.
  await card(page, "Draft cutover runbook").dragTo(column(page, "To do"));
  await expect(column(page, "To do").getByText("Draft cutover runbook")).toBeVisible();
  await expect
    .poll(async () => {
      const t = await find("Draft cutover runbook");
      return { active: t?.active, startedAt: t?.startedAt };
    })
    .toEqual({ active: true, startedAt: null });
});

test("the ⋯ menu moves a card without dragging", async ({ page }) => {
  const { mk } = await seed(page);
  await mk({ name: "Stakeholder sign-off" });
  await page.goto("/tasks");
  await page.getByRole("tab", { name: /Board/ }).click();

  await page.getByRole("button", { name: "More actions for Stakeholder sign-off" }).click();
  await page.getByRole("menuitem", { name: "Mark in progress" }).click();
  await expect(column(page, "In progress").getByText("Stakeholder sign-off")).toBeVisible();

  await page.getByRole("button", { name: "More actions for Stakeholder sign-off" }).click();
  await page.getByRole("menuitem", { name: "Move back to To do" }).click();
  await expect(column(page, "To do").getByText("Stakeholder sign-off")).toBeVisible();
});
