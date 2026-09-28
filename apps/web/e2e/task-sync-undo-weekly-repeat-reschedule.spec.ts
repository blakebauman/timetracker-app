import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The gaps in the first cut of tasks: other tabs hear about task edits, a
 * completion or delete can be taken back, a weekly repeat can fall on several
 * days, and Upcoming re-dates by drag.
 */

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type ApiTask = { id: string; name: string; active: boolean; dueDate: string | null; recurRule: string | null };

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
  const list = async () =>
    (await (await page.request.get("/api/tasks?includeInactive=true")).json()) as ApiTask[];
  return { project, origin, mk, list };
}

test("a task created elsewhere appears without a reload", async ({ page }) => {
  const { mk } = await seed(page);
  await mk({ name: "Cutover plan", dueDate: localDate(0) });
  await page.goto("/tasks");
  await expect(page.getByText("Cutover plan")).toBeVisible();

  // No X-Client-Id on this request, so the socket reports it to every tab —
  // the same as a write from another browser.
  await mk({ name: "Data mapping review", dueDate: localDate(0) });
  await expect(page.getByText("Data mapping review")).toBeVisible({ timeout: 8000 });
});

test("a deleted task can be brought back from its toast, and is gone otherwise", async ({ page }) => {
  const { mk, list } = await seed(page);
  await mk({ name: "Cutover plan", dueDate: localDate(0) });
  await mk({ name: "Stakeholder sign-off", dueDate: localDate(0) });
  await page.goto("/tasks");
  await expect(page.getByText("Cutover plan")).toBeVisible();

  const remove = async (name: string) => {
    await page.getByRole("button", { name: `More actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
  };

  // The toast repeats the task's name, so look for the row, not the text.
  const row = (name: string) => page.getByRole("button", { name: `Start timer for ${name}` });

  // Undo: the row returns and the server never saw a DELETE.
  await remove("Cutover plan");
  await expect(row("Cutover plan")).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row("Cutover plan")).toBeVisible();

  // No undo: the toast times out and the DELETE lands.
  await remove("Stakeholder sign-off");
  await expect(row("Stakeholder sign-off")).toBeHidden();
  await page.mouse.move(0, 0); // Sonner pauses its timer while hovered.
  await expect
    .poll(async () => (await list()).map((t) => t.name).sort(), { timeout: 15_000 })
    .toEqual(["Cutover plan"]);
});

test("undoing a repeating task's completion leaves no second occurrence", async ({ page }) => {
  const { mk, list } = await seed(page);
  await mk({ name: "Weekly status report", dueDate: localDate(0), recurRule: "daily" });
  await page.goto("/tasks");

  await page.getByRole("button", { name: "Mark task done" }).first().click();
  await page.getByRole("button", { name: "Undo" }).click();

  await expect
    .poll(async () => {
      const tasks = await list();
      return tasks.map((t) => ({ active: t.active, rule: t.recurRule, due: t.dueDate }));
    })
    .toEqual([{ active: true, rule: "daily", due: localDate(0) }]);
});

test("a weekly repeat can fall on several days", async ({ page }) => {
  const { mk, list } = await seed(page);
  await mk({ name: "Stand-up notes", dueDate: localDate(0) });
  await page.goto("/tasks");

  await page.getByRole("button", { name: "More actions for Stand-up notes" }).click();
  await page.getByRole("menuitem", { name: "Edit task…" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await dialog.getByRole("combobox", { name: "Repeat" }).click();
  await page.getByRole("option", { name: "Weekly on…" }).click();

  // Seeded with the due day; pick Monday and Wednesday instead.
  const group = dialog.getByRole("group", { name: "Repeat on" });
  const today = new Date().getDay();
  for (const [day, label] of [[1, "Monday"], [3, "Wednesday"]] as const) {
    if (day !== today) await group.getByRole("button", { name: label }).click();
  }
  if (today !== 1 && today !== 3) {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    await group.getByRole("button", { name: names[today] }).click();
  }
  await expect(group.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "Wednesday" })).toHaveAttribute("aria-pressed", "true");

  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(async () => (await list())[0].recurRule).toBe("weekly:1,3");
});

test("dragging a task onto another day in Upcoming re-dates it", async ({ page }) => {
  const { mk, list } = await seed(page);
  await mk({ name: "Cutover plan", dueDate: localDate(1) });
  await mk({ name: "Stakeholder sign-off", dueDate: localDate(3) });
  await page.goto("/tasks");
  await page.getByRole("tab", { name: /Upcoming/ }).click();
  await expect(page.getByText("Cutover plan")).toBeVisible();

  await page
    .getByRole("button", { name: "Start timer for Cutover plan" })
    .locator("xpath=ancestor::*[@draggable='true'][1]")
    .dragTo(page.getByRole("button", { name: "Rename Stakeholder sign-off" }), { timeout: 8000 });

  await expect
    .poll(async () => (await list()).find((t) => t.name === "Cutover plan")?.dueDate)
    .toBe(localDate(3));
});
