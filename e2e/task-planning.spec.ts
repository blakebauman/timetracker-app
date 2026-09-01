import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Tasks as the plan side of the timer: due dates, priority, subtasks and
 * recurrence, and the paths that turn a task into tracked time.
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
    await page.request.post("/api/projects", {
      data: { name: "ERP Migration", color: "#e11d48" },
      headers: { origin },
    })
  ).json();
  return { project, origin };
}

test("a task starts a timer in one click, and stopping offers to close it out", async ({ page }) => {
  const { project, origin } = await seed(page);
  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id, dueDate: localDate(0) },
    headers: { origin },
  });

  await page.goto("/tasks");
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: "Start timer for Cutover plan" }).click();
  await expect(page.getByRole("button", { name: "Stop timer for Cutover plan" })).toBeVisible();

  await page.getByRole("button", { name: "Stop timer for Cutover plan" }).click();
  // Due today counts as evidence the task may be finished, so the loop closes here.
  await expect(page.getByRole("button", { name: "Mark done" })).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "Mark done" }).click();
  await page.waitForTimeout(1200);

  const tasks = await (await page.request.get("/api/tasks?includeInactive=true")).json();
  expect(tasks[0].active).toBe(false);
  expect(tasks[0].completedAt).not.toBeNull();
});

test("quick-add parses a due date and a priority out of the line", async ({ page }) => {
  const { project, origin } = await seed(page);
  // The inline field appears once the surface has anything in it; the very first
  // task is captured through the empty state's own button. A single project
  // means the picker isn't in the way of capture either.
  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id, dueDate: localDate(0) },
    headers: { origin },
  });

  await page.goto("/tasks");
  await page.waitForTimeout(800);

  const field = page.getByRole("textbox", { name: "Add a task" }).first();
  await field.fill("chase signed SOW tomorrow p1");
  await expect(page.getByText(/due tomorrow/i)).toBeVisible();
  await field.press("Enter");
  await page.waitForTimeout(1200);

  const tasks = await (await page.request.get("/api/tasks")).json();
  const added = tasks.find((t: { name: string }) => t.name === "chase signed SOW");
  expect(added).toBeTruthy();
  expect(added.dueDate).toBe(localDate(1));
  expect(added.priority).toBe(1);
});

test("completing a repeating task creates the next occurrence", async ({ page }) => {
  const { project, origin } = await seed(page);
  await page.request.post("/api/tasks", {
    data: {
      name: "Weekly status report",
      projectId: project.id,
      dueDate: localDate(0),
      recurRule: "daily",
    },
    headers: { origin },
  });

  await page.goto("/tasks");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Mark task done" }).first().click();
  await page.waitForTimeout(1500);

  const tasks = await (await page.request.get("/api/tasks?includeInactive=true")).json();
  const open = tasks.filter((t: { active: boolean }) => t.active);
  const done = tasks.filter((t: { active: boolean }) => !t.active);
  expect(done).toHaveLength(1);
  // The next occurrence exists, is dated tomorrow, and carries the rule forward.
  expect(open).toHaveLength(1);
  expect(open[0].dueDate).toBe(localDate(1));
  expect(open[0].recurRule).toBe("daily");
  // …and the completed one no longer repeats, so reopening it can't spawn a second.
  expect(done[0].recurRule).toBeNull();
});

test("a subtask's tracked time rolls up into its parent", async ({ page }) => {
  const { project, origin } = await seed(page);
  const parent = await (
    await page.request.post("/api/tasks", {
      data: { name: "Phase 2 discovery", projectId: project.id, estimatedSeconds: 7200 },
      headers: { origin },
    })
  ).json();
  const child = await (
    await page.request.post("/api/tasks", {
      data: { name: "Data mapping", projectId: project.id, parentId: parent.id },
      headers: { origin },
    })
  ).json();

  // An hour logged against the child only.
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const stop = new Date(start.getTime() + 3600 * 1000);
  await page.request.post("/api/time_entries", {
    data: {
      description: "Data mapping",
      projectId: project.id,
      taskId: child.id,
      start: start.toISOString(),
      stop: stop.toISOString(),
      tags: [],
    },
    headers: { origin },
  });

  const tasks = await (await page.request.get("/api/tasks")).json();
  const p = tasks.find((t: { id: string }) => t.id === parent.id);
  expect(p.trackedSeconds).toBe(3600);
  expect(p.subtaskTotal).toBe(1);
  expect(p.subtaskDone).toBe(0);

  // Ticking the parent ticks the child with it.
  await page.request.put(`/api/tasks/${parent.id}`, {
    data: { active: false, completedOn: localDate(0) },
    headers: { origin },
  });
  const after = await (await page.request.get("/api/tasks?includeInactive=true")).json();
  expect(after.every((t: { active: boolean }) => !t.active)).toBe(true);
});
