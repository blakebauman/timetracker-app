import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * History: finished tasks by the week they were finished, with what they cost
 * against what they were estimated at.
 */

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test("finished tasks group by week with tracked time against estimates", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const post = async (url: string, data: Record<string, unknown>) =>
    (await page.request.post(url, { data, headers: { origin } })).json();
  const project = await post("/api/projects", { name: "ERP Migration", color: "#e11d48" });

  // Two finished this week: one estimated at 2h with 3h tracked, one unestimated.
  const a = await post("/api/tasks", { name: "Data mapping review", projectId: project.id, estimatedSeconds: 7200 });
  const b = await post("/api/tasks", { name: "Kick-off deck", projectId: project.id });
  await post("/api/tasks", { name: "Still open", projectId: project.id, dueDate: localDate(0) });
  const start = Date.now() - 4 * 3600e3;
  await post("/api/time_entries", {
    description: "Mapping",
    projectId: project.id,
    taskId: a.id,
    start: new Date(start).toISOString(),
    stop: new Date(start + 3 * 3600e3).toISOString(),
  });
  for (const id of [a.id, b.id]) {
    await page.request.put(`/api/tasks/${id}`, { data: { active: false, completedOn: localDate(0) }, headers: { origin } });
  }

  await page.goto("/tasks");
  const tab = page.getByRole("tab", { name: "History, 2 done this week" });
  await expect(tab).toBeVisible();
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-blake-Projects-timetracker-app/ed74931f-ab73-414f-bf30-33250cc1991d/scratchpad/history-tabs-today.png" });
  await tab.click();

  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  // 3h tracked in total; 3h against the 2h that was estimated = 150%.
  await expect(page.getByText("3h tracked · 150% of estimates")).toBeVisible();
  await expect(page.getByText("Data mapping review")).toBeVisible();
  await expect(page.getByText("Kick-off deck")).toBeVisible();
  await expect(page.getByText("Still open")).toBeHidden();
  // Nothing to capture into a record of finished work.
  await expect(page.getByRole("textbox", { name: "Add a task" })).toBeHidden();
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-blake-Projects-timetracker-app/ed74931f-ab73-414f-bf30-33250cc1991d/scratchpad/history.png" });

  await page.getByRole("tab", { name: /^All/ }).click();
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-blake-Projects-timetracker-app/ed74931f-ab73-414f-bf30-33250cc1991d/scratchpad/history-all-header.png" });
});
