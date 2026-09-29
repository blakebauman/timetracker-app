import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Scheduled tasks: a time of day turns a due date into a planned block on the
 * calendar — captured with a time token, shown dotted beside tracked time,
 * started from the block, carried through repeats, and announced when due.
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
  scheduledMinute: number | null;
  estimatedSeconds: number | null;
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
  return { project, mk, put, all };
}

test("a time token schedules the task, and the row shows the time", async ({ page }) => {
  const { mk, all } = await seed(page);
  await mk({ name: "Cutover plan", dueDate: localDate(0) });
  await page.goto("/tasks");

  const field = page.getByRole("textbox", { name: "Add a task" });
  await field.fill("Call the bank tomorrow 3pm");
  await expect(page.getByText(/due tomorrow at 15:00/)).toBeVisible();
  await field.press("Enter");

  await expect
    .poll(async () => {
      const t = (await all()).find((x) => x.name === "Call the bank");
      return t && { due: t.dueDate, min: t.scheduledMinute };
    })
    .toEqual({ due: localDate(1), min: 900 });

  await page.getByRole("tab", { name: /Upcoming/ }).click();
  await expect(page.getByRole("button", { name: "Due Tomorrow 15:00 — change" })).toBeVisible();
});

test("a scheduled task is a planned block on the calendar, and its ▷ starts the timer", async ({ page }) => {
  const { mk } = await seed(page);
  const task = await mk({
    name: "Stakeholder sign-off",
    dueDate: localDate(0),
    scheduledMinute: 10 * 60,
    estimatedSeconds: 3600,
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  const block = page.locator(".tt-event-planned", { hasText: "Stakeholder sign-off" });
  await expect(block).toBeVisible();
  await expect(block).toContainText("planned");

  await block.locator("[data-start-task]").click();
  await expect
    .poll(async () => (await (await page.request.get("/api/time_entries/current")).json())?.taskId)
    .toBe(task.id);
});

test("clicking a planned block opens the task, and a new time moves it", async ({ page }) => {
  const { mk, all } = await seed(page);
  await mk({ name: "Data mapping review", dueDate: localDate(0), scheduledMinute: 9 * 60 });

  await page.goto("/");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.locator(".tt-event-planned", { hasText: "Data mapping review" }).click({ position: { x: 60, y: 30 } });

  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Time")).toHaveValue("09:00");
  await dialog.getByLabel("Time").fill("11:30");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(async () => (await all())[0].scheduledMinute).toBe(11 * 60 + 30);
});

test("clearing the day clears the time; a repeat keeps it", async ({ page }) => {
  const { mk, put, all } = await seed(page);
  const once = await mk({ name: "One-off", dueDate: localDate(0), scheduledMinute: 600 });
  await put(once.id, { dueDate: null });
  const standup = await mk({
    name: "Stand-up",
    dueDate: localDate(0),
    scheduledMinute: 570,
    recurRule: "daily",
  });
  await put(standup.id, { active: false, completedOn: localDate(0) });

  const tasks = await all();
  expect(tasks.find((t) => t.id === once.id)?.scheduledMinute).toBeNull();
  const next = tasks.find((t) => t.name === "Stand-up" && t.active);
  expect(next).toMatchObject({ dueDate: localDate(1), scheduledMinute: 570 });
});

test("a block announces itself when it starts", async ({ page }) => {
  // Pin the page's clock a moment before a 10:00 block, then run it past.
  const now = new Date();
  now.setHours(9, 59, 40, 0);
  await page.clock.install({ time: now });

  const { mk } = await seed(page);
  await mk({ name: "Stakeholder sign-off", dueDate: localDate(0), scheduledMinute: 600 });
  await page.goto("/tasks");
  await expect(page.getByText("Stakeholder sign-off")).toBeVisible();

  await page.clock.fastForward("00:30");
  const toastEl = page.locator("[data-sonner-toast]", { hasText: "Stakeholder sign-off — 10:00" });
  await expect(toastEl).toBeVisible();
  await expect(toastEl.getByRole("button", { name: "Start timer" })).toBeVisible();
});

test("dragging a planned block reschedules it", async ({ page }) => {
  const { mk, all } = await seed(page);
  await mk({ name: "Planned block", dueDate: localDate(0), scheduledMinute: 600, estimatedSeconds: 3600 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();

  const block = page.locator(".tt-event-planned", { hasText: "Planned block" });
  const b = (await block.boundingBox())!;
  // Real pointer steps: FullCalendar ignores a single-jump synthetic drag.
  await page.mouse.move(b.x + b.width / 2, b.y + 8);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width / 2, b.y + 8 + i * 12);
  await page.mouse.up();

  await expect.poll(async () => (await all())[0].scheduledMinute).toBeGreaterThan(600);
  expect((await all())[0].dueDate).toBe(localDate(0));
});

test("a rail task dropped on a future slot is scheduled there, not logged", async ({ page }) => {
  const { mk, all } = await seed(page);
  await mk({ name: "Rail task", dueDate: localDate(0) });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Show today's tasks" }).click();

  const rail = page.locator("[data-task-drag]", { hasText: "Rail task" });
  const future = page.locator(".fc-timegrid-col.fc-day-future").first();
  // Only a week with a future day in view can take this drop (not Sundays
  // with a Monday week start, say); the logged-entry path covers the rest.
  test.skip((await future.count()) === 0, "no future day in the visible week");
  const r = (await rail.boundingBox())!;
  const c = (await future.boundingBox())!;
  const l = (await page.locator(".fc-timegrid-slot-lane").nth(28).boundingBox())!;
  await page.mouse.move(r.x + 20, r.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(r.x + 20 + ((c.x + 30 - r.x - 20) * i) / 15, r.y + 10 + ((l.y + 5 - r.y - 10) * i) / 15);
  }
  await page.mouse.up();

  await expect(page.getByText("Scheduled Rail task")).toBeVisible();
  await expect.poll(async () => (await all())[0].scheduledMinute).not.toBeNull();
  const entries = await (await page.request.get("/api/time_entries")).json();
  expect(entries).toHaveLength(0);
});
