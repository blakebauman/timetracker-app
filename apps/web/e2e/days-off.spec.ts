import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Days off: booked PTO, bank holidays and half days. Everything that assumed
 * "a weekday is a working day" reads them — budget pacing, Plan my day, the
 * plan column — so a week of leave stops looking like a week of lost time.
 */

type DayOff = { id: string; date: string; portion: "full" | "am" | "pm"; label: string };

/** A local YYYY-MM-DD `delta` days from `base`. */
function shift(base: string, delta: number): string {
  return new Date(Date.parse(`${base}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

/** The first Monday strictly after `base`, so a Mon–Fri range is always five weekdays. */
function nextMonday(base: string): string {
  let d = shift(base, 1);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = shift(d, 1);
  return d;
}

/** Same as the plan-day spec: the offset that makes it 09:05 for the user right now. */
function nineOhFiveZone() {
  const now = new Date();
  let offset = now.getUTCHours() * 60 + now.getUTCMinutes() - (9 * 60 + 5);
  if (offset > 840) offset -= 1440;
  const today = new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
  return { offset, today };
}

async function api(page: Page) {
  const origin = new URL(page.url()).origin;
  return {
    post: (url: string, data: Record<string, unknown>) =>
      page.request.post(url, { data, headers: { origin } }),
    del: (url: string) => page.request.delete(url, { headers: { origin } }),
    get: async <T>(url: string) => (await (await page.request.get(url)).json()) as T,
  };
}

test("a range books its weekdays only, and re-booking a day replaces it", async ({ page }) => {
  await signUp(page);
  const { post, get, del } = await api(page);
  const monday = nextMonday(new Date().toISOString().slice(0, 10));

  // Mon → the following Sunday: five weekdays, the weekend skipped.
  const created = (await (
    await post("/api/days-off", { from: monday, to: shift(monday, 6), label: "Holiday" })
  ).json()) as DayOff[];
  expect(created.map((d) => d.date)).toEqual([0, 1, 2, 3, 4].map((n) => shift(monday, n)));
  expect(created.every((d) => d.portion === "full" && d.label === "Holiday")).toBe(true);

  // Wednesday again, as a morning off: one row, now a half day.
  await post("/api/days-off", { from: shift(monday, 2), portion: "am", label: "Dentist" });
  const list = await get<DayOff[]>(`/api/days-off?from=${monday}`);
  expect(list).toHaveLength(5);
  expect(list.find((d) => d.date === shift(monday, 2))).toMatchObject({ portion: "am", label: "Dentist" });

  // A half day across a range isn't a thing anyone books.
  const bad = await post("/api/days-off", { from: monday, to: shift(monday, 1), portion: "pm" });
  expect(bad.status()).toBe(400);

  expect((await del(`/api/days-off/${list[0].id}`)).status()).toBe(204);
  expect(await get<DayOff[]>(`/api/days-off?from=${monday}`)).toHaveLength(4);
});

test("pacing stops counting booked days as working days", async ({ page }) => {
  await signUp(page);
  const { post, get } = await api(page);
  const today = new Date().toISOString().slice(0, 10);
  const monday = nextMonday(today);

  const project = await (
    await post("/api/projects", {
      name: "ERP Migration",
      color: "#e11d48",
      estimatedHours: 100,
      endDate: shift(monday, 27),
    })
  ).json();
  const remaining = async () =>
    (await get<{ projectId: string; workingDaysRemaining: number }[]>("/api/projects/pacing")).find(
      (p) => p.projectId === project.id
    )!.workingDaysRemaining;

  const before = await remaining();
  await post("/api/days-off", { from: monday, to: shift(monday, 4) });
  expect(await remaining()).toBe(before - 5);
  // A half day is half a working day.
  await post("/api/days-off", { from: shift(monday, 7), portion: "pm" });
  expect(await remaining()).toBe(before - 5.5);
});

test("Plan my day fills nothing on a day off, and only the afternoon of a morning off", async ({ page }) => {
  await signUp(page);
  const { post, get, del } = await api(page);
  const { offset, today } = nineOhFiveZone();
  const project = await (await post("/api/projects", { name: "ERP Migration", color: "#e11d48" })).json();
  await post("/api/tasks", { projectId: project.id, name: "Review", dueDate: today, estimatedSeconds: 3600 });

  type Plan = {
    placed: { name: string; startMinute: number }[];
    unplaced: { name: string }[];
    freeMinutes: number;
    dayOff: string | null;
  };
  const plan = () => get<Plan>(`/api/assistant/plan-day?timezoneOffsetMinutes=${offset}`);

  const [off] = (await (await post("/api/days-off", { from: today })).json()) as DayOff[];
  const full = await plan();
  expect(full.dayOff).toBe("full");
  expect(full.placed).toEqual([]);
  expect(full.unplaced.map((u) => u.name)).toEqual(["Review"]);
  expect(full.freeMinutes).toBe(0);

  // Morning off: 09:00–17:30 halves at 13:15, so the first slot is there.
  await del(`/api/days-off/${off.id}`);
  await post("/api/days-off", { from: today, portion: "am" });
  const half = await plan();
  expect(half.dayOff).toBe("am");
  expect(half.placed).toEqual([expect.objectContaining({ name: "Review", startMinute: 13 * 60 + 15 })]);
});

test("time off is booked from Settings and shows in the plan", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings?tab=general");

  const card = page.locator("[data-slot=card]", { hasText: "Time off" });
  await expect(card.getByText("Book holidays, bank holidays and half days")).toBeVisible();
  await card.getByRole("button", { name: "Add" }).click();

  const dialog = page.getByRole("dialog", { name: "Add time off" });
  await dialog.getByLabel("Label (optional)").fill("Bank holiday");
  await dialog.getByRole("button", { name: "Add time off" }).click();
  await expect(dialog).toBeHidden();

  // Today, as a whole day: one row, labelled.
  await expect(card.getByText("Bank holiday · Whole day")).toBeVisible();

  // The plan column says so beside Today.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Today.*Day off/ })).toBeVisible();

  // And removing it from Settings clears it.
  await page.goto("/settings?tab=general");
  await card.getByRole("button", { name: /Remove time off/ }).click();
  await expect(card.getByText("Book holidays, bank holidays and half days")).toBeVisible();
});
