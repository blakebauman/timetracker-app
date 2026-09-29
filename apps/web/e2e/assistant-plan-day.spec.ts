import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * "Plan my day": today's unscheduled tasks placed into the free part of the
 * working day, most urgent first, around blocks already planned. The same
 * computation backs the Assistant's planDay tool.
 */

type Plan = {
  localDate: string;
  placed: { taskId: string; name: string; startMinute: number; minutes: number }[];
  unplaced: { name: string }[];
  freeMinutes: number;
};

/**
 * The plan reads "now" from the server clock, in the caller's timezone. Pick
 * the offset that makes it 09:05 for the user right now, so the whole working
 * day is ahead whatever time CI happens to run.
 */
function nineOhFiveZone() {
  const now = new Date();
  let offset = now.getUTCHours() * 60 + now.getUTCMinutes() - (9 * 60 + 5);
  if (offset > 840) offset -= 1440;
  const local = new Date(now.getTime() - offset * 60_000);
  const day = (delta: number) => {
    const d = new Date(local.getTime() + delta * 86_400_000);
    return d.toISOString().slice(0, 10);
  };
  return { offset, day };
}

test("today's tasks are placed around what's already scheduled, most urgent first", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const post = async (url: string, data: Record<string, unknown>) =>
    (await page.request.post(url, { data, headers: { origin } })).json();
  const project = await post("/api/projects", { name: "ERP Migration", color: "#e11d48" });
  const mk = (data: Record<string, unknown>) => post("/api/tasks", { projectId: project.id, ...data });
  const { offset, day } = nineOhFiveZone();

  await mk({ name: "Low priority", dueDate: day(0), priority: 4, estimatedSeconds: 3600 });
  await mk({ name: "Urgent review", dueDate: day(0), priority: 1, estimatedSeconds: 45 * 60 });
  await mk({ name: "Slipped chore", dueDate: day(-1) });
  await mk({ name: "Already at 10", dueDate: day(0), scheduledMinute: 10 * 60, estimatedSeconds: 3600 });
  await mk({ name: "Tomorrow's thing", dueDate: day(1) });
  await mk({ name: "Whole day job", dueDate: day(0), estimatedSeconds: 20 * 3600 });

  const plan = (await (await page.request.get(`/api/assistant/plan-day?timezoneOffsetMinutes=${offset}`)).json()) as Plan;
  const at = (name: string) => plan.placed.find((p) => p.name === name);

  expect(plan.localDate).toBe(day(0));
  // 09:15 is the first quarter hour after 09:05: the urgent task takes it, in
  // the 45 minutes before the 10:00 block.
  expect(at("Urgent review")).toMatchObject({ startMinute: 9 * 60 + 15, minutes: 45 });
  // Then the working day resumes after the 10:00–11:00 block, in priority order.
  expect(at("Slipped chore")).toMatchObject({ startMinute: 11 * 60, minutes: 30 });
  expect(at("Low priority")).toMatchObject({ startMinute: 11 * 60 + 30, minutes: 60 });
  // Not today's, or already planned.
  expect(at("Tomorrow's thing")).toBeUndefined();
  expect(at("Already at 10")).toBeUndefined();
  // Too long for any free stretch: reported, never split around a block.
  expect(plan.unplaced.map((u) => u.name)).toEqual(["Whole day job"]);
  // 09:15–17:30 less the 10:00 hour.
  expect(plan.freeMinutes).toBe(8 * 60 + 15 - 60);
});
