import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Tags on tasks, from the same vocabulary as entries: captured with `@tag`,
 * matched to an existing tag regardless of case, carried by a repeat, and
 * inherited by every entry logged against the task.
 */

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type ApiTask = { id: string; name: string; active: boolean; tags: string[] };

async function seed(page: import("@playwright/test").Page) {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await (
    await page.request.post("/api/projects", {
      data: { name: "ERP Migration", color: "#e11d48" },
      headers: { origin },
    })
  ).json();
  const post = async (url: string, data: Record<string, unknown>) =>
    (await page.request.post(url, { data, headers: { origin } })).json();
  const mk = (data: Record<string, unknown>) =>
    post("/api/tasks", { projectId: project.id, ...data }) as Promise<ApiTask>;
  const all = async () =>
    (await (await page.request.get("/api/tasks?includeInactive=true")).json()) as ApiTask[];
  return { project, origin, post, mk, all };
}

test("@tags in quick-add join existing tags by name, ignoring case", async ({ page }) => {
  const { project, post, mk, all } = await seed(page);
  // An existing tag, created the way entries create them.
  await post("/api/time_entries", {
    description: "Earlier work",
    projectId: project.id,
    start: new Date(Date.now() - 7200e3).toISOString(),
    stop: new Date(Date.now() - 3600e3).toISOString(),
    tags: ["discovery"],
  });
  await mk({ name: "Cutover plan", dueDate: localDate(0) });
  await page.goto("/tasks");

  const field = page.getByRole("textbox", { name: "Add a task" });
  await field.fill("Map vendor tables @Discovery @client-call");
  await expect(page.getByText(/@Discovery · @client-call/)).toBeVisible();
  await field.press("Enter");

  await expect
    .poll(async () => (await all()).find((t) => t.name === "Map vendor tables")?.tags.sort())
    .toEqual(["client-call", "discovery"]);
  const tags = (await (await page.request.get("/api/tags")).json()) as { name: string }[];
  expect(tags.map((t) => t.name).sort()).toEqual(["client-call", "discovery"]);
  await expect(page.getByText("client-call", { exact: true })).toBeVisible();
});

test("an entry started from a task inherits its tags", async ({ page }) => {
  const { mk } = await seed(page);
  const task = await mk({ name: "Data mapping review", dueDate: localDate(0), tags: ["discovery"] });
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Start timer for Data mapping review" }).click();

  await expect
    .poll(async () => {
      const cur = await (await page.request.get("/api/time_entries/current")).json();
      return cur && { task: cur.taskId, tags: cur.tags };
    })
    .toEqual({ task: task.id, tags: ["discovery"] });
});

test("the dialog edits tags, and a repeat carries them", async ({ page }) => {
  const { origin, mk, all } = await seed(page);
  const t = await mk({ name: "Weekly report", dueDate: localDate(0), recurRule: "daily" });
  await page.goto("/tasks");

  await page.getByRole("button", { name: "More actions for Weekly report" }).click();
  await page.getByRole("menuitem", { name: "Edit task…" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await dialog.getByRole("button", { name: "Add tags" }).click();
  await page.getByPlaceholder(/tag/i).last().fill("reporting");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(async () => (await all())[0].tags).toEqual(["reporting"]);

  await page.request.put(`/api/tasks/${t.id}`, {
    data: { active: false, completedOn: localDate(0) },
    headers: { origin },
  });
  const next = (await all()).find((x) => x.active);
  expect(next?.tags).toEqual(["reporting"]);
});
