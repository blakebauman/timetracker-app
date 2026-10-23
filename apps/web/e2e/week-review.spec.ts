import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Closing a week: the pass over a finished week before its hours are copied
 * into another system. Flags are arithmetic over the entries, working hours
 * and days off; closing snapshots the hours, and a later edit shows up as a
 * change to re-submit.
 */

type Review = {
  weekStart: string;
  days: { date: string; trackedSeconds: number; expectedSeconds: number; flags: { kind: string }[] }[];
  rows: { projectId: string | null; name: string; perDay: number[]; totalSeconds: number }[];
  totalSeconds: number;
  closure: { changes: { date: string; beforeSeconds: number; afterSeconds: number }[] } | null;
};

const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The Monday of last week, in UTC — a whole week in the past, so every day is settled. */
function lastMonday(): string {
  const today = new Date().toISOString().slice(0, 10);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return shift(today, -((weekday + 6) % 7) - 7);
}

async function api(page: Page) {
  const origin = new URL(page.url()).origin;
  const headers = { origin };
  return {
    post: async (url: string, data: Record<string, unknown>) =>
      (await page.request.post(url, { data, headers })).json(),
    put: (url: string, data: Record<string, unknown>) => page.request.put(url, { data, headers }),
    del: (url: string) => page.request.delete(url, { headers }),
    review: async (weekStart: string) =>
      (await (await page.request.get(`/api/week-review?weekStart=${weekStart}&timezoneOffsetMinutes=0`)).json()) as Review,
  };
}

const at = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;

test("a finished week is flagged where it looks off, and its hours are grouped by project", async ({ page }) => {
  await signUp(page);
  const { post, review } = await api(page);
  const mon = lastMonday();
  const erp = await post("/api/projects", { name: "ERP Migration", color: "#e11d48" });
  const entry = (date: string, from: string, to: string, projectId: string | null = erp.id) =>
    post("/api/time_entries", { description: "Work", projectId, start: at(date, from), stop: at(date, to) });

  await entry(mon, "09:00", "11:00"); // Mon: 2h — short of 8h 30m
  await entry(shift(mon, 1), "09:00", "17:00"); // Tue: 8h, plus a half-hour overlap
  await entry(shift(mon, 1), "16:30", "17:00");
  await entry(shift(mon, 2), "09:00", "17:00"); // Wed: 8h, one hour of it unassigned
  await entry(shift(mon, 2), "17:00", "18:00", null);
  await post("/api/days-off", { from: shift(mon, 3) }); // Thu: off, yet an hour logged
  await entry(shift(mon, 3), "10:00", "11:00");
  await entry(shift(mon, 4), "09:00", "17:00"); // Fri: a normal day

  const r = await review(mon);
  const flags = (i: number) => r.days[i].flags.map((f) => f.kind).sort();
  expect(r.days.map((d) => d.date)).toEqual([0, 1, 2, 3, 4, 5, 6].map((n) => shift(mon, n)));
  expect(flags(0)).toEqual(["short"]);
  expect(flags(1)).toEqual(["overlap"]);
  expect(flags(2)).toEqual(["no_project"]);
  expect(flags(3)).toEqual(["off_day_work"]);
  expect(r.days[3].expectedSeconds).toBe(0);
  expect(flags(4)).toEqual([]);
  // The weekend expects nothing and logged nothing.
  expect(flags(5)).toEqual([]);

  // One row per project, unassigned time last; the overlap still counts twice
  // in the totals, which is exactly why it's flagged.
  expect(r.rows.map((row) => row.name)).toEqual(["ERP Migration", "No project"]);
  expect(r.rows[0].perDay.slice(0, 5)).toEqual([2, 8.5, 8, 1, 8].map((h) => h * 3600));
  expect(r.totalSeconds).toBe((2 + 8.5 + 9 + 1 + 8) * 3600);
});

test("closing snapshots the week; a later edit shows as a change until it's closed again", async ({ page }) => {
  await signUp(page);
  const { post, put, del, review } = await api(page);
  const mon = lastMonday();
  const erp = await post("/api/projects", { name: "ERP Migration", color: "#e11d48" });
  const e = await post("/api/time_entries", {
    description: "Work",
    projectId: erp.id,
    start: at(shift(mon, 1), "09:00"),
    stop: at(shift(mon, 1), "12:00"),
  });

  expect((await review(mon)).closure).toBeNull();
  await post("/api/week-review/close", { weekStart: mon, timezoneOffsetMinutes: 0 });
  expect((await review(mon)).closure?.changes).toEqual([]);

  // Forty-five more minutes on Tuesday, after the week went in.
  await put(`/api/time_entries/${e.id}`, { stop: at(shift(mon, 1), "12:45") });
  const changed = await review(mon);
  expect(changed.closure?.changes).toEqual([
    expect.objectContaining({ date: shift(mon, 1), beforeSeconds: 3 * 3600, afterSeconds: 3.75 * 3600 }),
  ]);

  await post("/api/week-review/close", { weekStart: mon, timezoneOffsetMinutes: 0 });
  expect((await review(mon)).closure?.changes).toEqual([]);

  expect((await del(`/api/week-review/close?weekStart=${mon}`)).status()).toBe(204);
  expect((await review(mon)).closure).toBeNull();
});

test("the week is reviewed and closed from the Timer header", async ({ page }) => {
  await signUp(page);
  const { post } = await api(page);
  const project = await post("/api/projects", { name: "ERP Migration", color: "#e11d48" });
  const now = Date.now();
  await post("/api/time_entries", {
    description: "Work",
    projectId: project.id,
    start: new Date(now - 2 * 3600_000).toISOString(),
    stop: new Date(now - 3600_000).toISOString(),
  });
  await page.reload();

  await page.getByRole("button", { name: "Review and close week" }).click();
  const dialog = page.getByRole("dialog", { name: /^Week of/ });
  await expect(dialog.getByRole("region", { name: "Hours by project" }).getByText("ERP Migration")).toBeVisible();

  await dialog.getByRole("button", { name: "Close week" }).click();
  await expect(dialog.getByText(/Nothing has changed since/)).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Week closed — review" })).toBeVisible();
});
