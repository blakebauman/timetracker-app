import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Status update: one project's week as paste-ready text. The itemised style is
 * deterministic (no model), so its text is asserted line for line; the
 * highlights style may or may not reach Workers AI here, and either way must
 * come back with the same facts below its opening section.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Monday 00:00 local of the current week — the dialog's default week. */
function thisMonday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

async function seed(page: Page) {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const post = async (url: string, data: Record<string, unknown>) => {
    const res = await page.request.post(url, { data, headers: { origin } });
    expect(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
    return res.json();
  };
  const client = await post("/api/clients", { name: "Northwind" });
  const project = await post("/api/projects", { name: "ERP Migration", color: "#e11d48", clientId: client.id });
  const other = await post("/api/projects", { name: "Internal", color: "#2563eb" });

  const monday = thisMonday();
  const at = (hours: number) => new Date(monday.getTime() + hours * 3600e3).toISOString();
  const entry = (description: string, from: number, to: number, extra: Record<string, unknown> = {}) =>
    post("/api/time_entries", { description, projectId: project.id, start: at(from), stop: at(to), ...extra });

  const mapping = await post("/api/tasks", { name: "Data mapping", projectId: project.id });
  const deck = await post("/api/tasks", { name: "Cutover plan", projectId: project.id });
  // Due the Tuesday after this week: lands in "Next".
  const nextTue = new Date(monday);
  nextTue.setDate(nextTue.getDate() + 8);
  await post("/api/tasks", { name: "Go-live checklist", projectId: project.id, dueDate: ymd(nextTue) });

  await entry("Mapping GL accounts", 1, 3, { taskId: mapping.id });
  await entry("mapping gl accounts", 4, 5); // same work, different case: one line, 2×
  await entry("Vendor review", 5, 5.5);
  await entry("Steering committee", 6, 7, { calendarEventId: "evt-steerco" });
  // Another project's time never leaks into this one's update.
  await post("/api/time_entries", { description: "Payroll", projectId: other.id, start: at(1), stop: at(2) });

  await page.request.put(`/api/tasks/${deck.id}`, {
    data: { active: false, completedOn: ymd(new Date()) },
    headers: { origin },
  });

  return { origin, project, monday };
}

test("itemised status update lists the week's facts for one project only", async ({ page }) => {
  const { origin, project, monday } = await seed(page);
  const until = new Date(monday);
  until.setDate(until.getDate() + 7);

  const res = await page.request.post("/api/ai/status-update", {
    headers: { origin },
    data: {
      projectId: project.id,
      since: monday.toISOString(),
      until: until.toISOString(),
      timezoneOffsetMinutes: monday.getTimezoneOffset(),
      style: "itemised",
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  expect(body).toMatchObject({
    source: "itemised",
    projectName: "ERP Migration",
    totalSeconds: 4.5 * 3600,
    entryCount: 4,
    completedCount: 1,
    meetingCount: 1,
  });
  const lines: string[] = body.text.split("\n");
  expect(lines[0]).toMatch(/^ERP Migration \(Northwind\): status for /);
  expect(lines[1]).toBe("4h 30m tracked across 4 entries, 1h of it in meetings.");
  expect(body.text).toContain("Work\n- Mapping GL accounts — 3h (2×)\n- Vendor review — 30m");
  expect(body.text).toContain("Completed\n- Cutover plan");
  expect(body.text).toContain("In progress\n- Data mapping — 2h this week");
  expect(body.text).toContain("Meetings\n- Steering committee — 1h");
  expect(body.text).toMatch(/Next\n- Go-live checklist \(Tue \d+ \w{3}\)/);
  expect(body.text).not.toContain("Payroll");
  // Hours, never decimals or money.
  expect(body.text).not.toMatch(/\d\.\d+\s*h|£|\$/);

  // Someone else's project id is a 404, not an empty update.
  const missing = await page.request.post("/api/ai/status-update", {
    headers: { origin },
    data: {
      projectId: "not-a-project",
      since: monday.toISOString(),
      until: until.toISOString(),
      timezoneOffsetMinutes: 0,
    },
  });
  expect(missing.status()).toBe(404);
});

test("highlights style always returns the facts, model or not", async ({ page }) => {
  test.setTimeout(60_000);
  const { origin, project, monday } = await seed(page);
  const until = new Date(monday);
  until.setDate(until.getDate() + 7);
  const res = await page.request.post("/api/ai/status-update", {
    headers: { origin },
    data: {
      projectId: project.id,
      since: monday.toISOString(),
      until: until.toISOString(),
      timezoneOffsetMinutes: monday.getTimezoneOffset(),
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(["ai", "fallback"]).toContain(body.source);
  // The opening is the model's bullets or, when it failed, the itemised list.
  expect(body.text).toContain(body.source === "ai" ? "Highlights\n- " : "Work\n- Mapping GL accounts");
  expect(body.text).toContain("Completed\n- Cutover plan");
  expect(body.text).toContain("Meetings\n- Steering committee — 1h");
});

test("the Projects page opens a week's status update and copies it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page);

  await page.goto("/projects");
  await expect(page.getByText("ERP Migration")).toBeVisible();
  // Sorted by name: ERP Migration is the first row, Internal the second.
  await page.getByRole("button", { name: "Project actions" }).first().click();
  await page.getByRole("menuitem", { name: "Status update" }).click();

  const dialog = page.getByRole("dialog", { name: "Status update" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("This week")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Next week" })).toBeDisabled();

  await dialog.getByRole("radio", { name: "Itemised" }).click();
  const text = dialog.getByRole("textbox", { name: "Status update text" });
  await expect(text).toHaveValue(/Mapping GL accounts — 3h \(2×\)/);

  // Edits are what gets copied.
  await text.fill(`${await text.inputValue()}\n\nBlockers: none`);
  await dialog.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText("Status update copied")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Completed\n- Cutover plan");
  expect(copied.endsWith("Blockers: none")).toBeTruthy();

  // Last week has nothing tracked on this project, and says so.
  await dialog.getByRole("button", { name: "Previous week" }).click();
  await expect(dialog.getByText("Last week")).toBeVisible();
  await expect(text).toHaveValue(/No time tracked this week\./);
});
