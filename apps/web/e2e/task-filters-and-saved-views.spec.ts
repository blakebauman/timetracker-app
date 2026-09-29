import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The All tab's filters (status, project, tag, priority, due) and saved views:
 * a named, per-user snapshot of search + filters + grouping + sort.
 */

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function seed(page: import("@playwright/test").Page) {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await (
    await page.request.post("/api/projects", { data: { name: "ERP Migration", color: "#e11d48" }, headers: { origin } })
  ).json();
  const mk = (data: Record<string, unknown>) =>
    page.request.post("/api/tasks", { data: { projectId: project.id, ...data }, headers: { origin } });
  await mk({ name: "Map vendor tables", tags: ["discovery"], priority: 1, dueDate: localDate(0) });
  await mk({ name: "Cutover plan", priority: 2, dueDate: localDate(3) });
  await mk({ name: "Stakeholder sign-off", tags: ["client-call"], priority: 4 });
  await mk({ name: "Slipped task", dueDate: localDate(-2) });
}

const row = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("button", { name: `Start timer for ${name}` });

test("filters narrow the All tab by tag, priority and due date", async ({ page }) => {
  await seed(page);
  await page.goto("/tasks");
  await page.getByRole("tab", { name: /All/ }).click();

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("combobox", { name: "Filter by priority" }).click();
  await page.getByRole("option", { name: /High and above/ }).click();
  await expect(row(page, "Map vendor tables")).toBeVisible();
  await expect(row(page, "Cutover plan")).toBeVisible();
  await expect(row(page, "Stakeholder sign-off")).toBeHidden();

  await page.getByRole("combobox", { name: "Filter by tag" }).click();
  await page.getByRole("option", { name: "discovery" }).click();
  await expect(row(page, "Cutover plan")).toBeHidden();
  await expect(page.getByRole("button", { name: "Filters, 2 active" })).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("combobox", { name: "Filter by due date" }).click();
  await page.getByRole("option", { name: "Overdue" }).click();
  await expect(row(page, "Slipped task")).toBeVisible();
  await expect(row(page, "Map vendor tables")).toBeHidden();
});

test("a saved view comes back after a reload and can be deleted", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tasks");
  await page.getByRole("tab", { name: /All/ }).click();

  await page.getByRole("searchbox", { name: "Search tasks" }).fill("plan");
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("combobox", { name: "Filter by priority" }).click();
  await page.getByRole("option", { name: /High and above/ }).click();
  await page.getByRole("combobox", { name: "Saved view" }).click();
  await page.getByRole("option", { name: "Save current view…" }).click();
  await page.getByRole("textbox", { name: "View name" }).fill("Urgent planning");
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("button", { name: "Filters, view: Urgent planning" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-blake-Projects-timetracker-app/ed74931f-ab73-414f-bf30-33250cc1991d/scratchpad/views-saved.png" });

  await page.reload();
  await page.getByRole("tab", { name: /All/ }).click();
  await expect(row(page, "Stakeholder sign-off")).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("combobox", { name: "Saved view" }).click();
  await page.getByRole("option", { name: "Urgent planning" }).click();
  await expect(page.getByRole("searchbox", { name: "Search tasks" })).toHaveValue("plan");
  await expect(row(page, "Cutover plan")).toBeVisible();
  await expect(row(page, "Stakeholder sign-off")).toBeHidden();

  await page.getByRole("combobox", { name: "Saved view" }).click();
  await page.getByRole("option", { name: "Delete “Urgent planning”" }).click();
  await expect
    .poll(async () => (await (await page.request.get("/api/task-views")).json()).length)
    .toBe(0);
});
