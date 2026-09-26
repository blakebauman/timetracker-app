import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

/**
 * A timer's times are billed, so they must be the times the user pressed —
 * not the times a request happened to reach the server.
 *
 * Offline, mutations used to be paused in memory by TanStack Query instead of
 * reaching the app's IndexedDB queue, and the stop request carried no time of
 * its own, so a timer stopped offline was stopped at *reconnect* time. A stop
 * the server rejected left an idle bar over an entry that was still running.
 */

const ONE_DAY = 86_400_000;

async function entryNamed(page: Page, description: string) {
  const since = new Date(Date.now() - ONE_DAY).toISOString();
  const until = new Date(Date.now() + ONE_DAY).toISOString();
  const list = (await (
    await page.request.get(`/api/time_entries?since=${since}&until=${until}`)
  ).json()) as { description: string; start: string; stop: string | null }[];
  return list.find((e) => e.description === description) ?? null;
}

async function current(page: Page) {
  return (await (await page.request.get("/api/time_entries/current")).json()) as {
    description: string;
  } | null;
}

test("a timer started and stopped offline syncs with the instants that were pressed", async ({
  page,
  context,
}) => {
  await signUp(page);
  // The session check and first data load need the network; drop it only once
  // the composer is on screen.
  await expect(page.getByPlaceholder("What are you working on?")).toBeVisible();
  await context.setOffline(true);
  await page.getByPlaceholder("What are you working on?").fill("Offline work");
  await page.keyboard.press("Escape");

  const pressedStart = Date.now();
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "timer is running" })
  ).toBeVisible();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);

  await page.waitForTimeout(2000);
  const pressedStop = Date.now();
  await page.getByRole("button", { name: "Stop timer" }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "Offline — stopped at" })
  ).toBeVisible();

  // Stay offline long enough that "stopped at reconnect" would be obvious.
  await page.waitForTimeout(5000);
  await context.setOffline(false);

  // The promise kept, out loud.
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "offline change" })
  ).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => entryNamed(page, "Offline work"), { timeout: 15_000 }).not.toBeNull();
  const entry = (await entryNamed(page, "Offline work"))!;
  expect(entry.stop).not.toBeNull();
  expect(Math.abs(Date.parse(entry.start) - pressedStart)).toBeLessThan(1500);
  expect(Math.abs(Date.parse(entry.stop!) - pressedStop)).toBeLessThan(1500);
  expect(await current(page)).toBeNull();
});

test("a running timer stopped offline is stopped at the press, not the reconnect", async ({
  page,
  context,
}) => {
  await signUp(page);
  await page.getByPlaceholder("What are you working on?").fill("Half offline");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect.poll(async () => (await current(page))?.description).toBe("Half offline");

  await context.setOffline(true);
  const pressedStop = Date.now();
  await page.getByRole("button", { name: "Stop timer" }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "Offline — stopped at" })
  ).toBeVisible();
  await page.waitForTimeout(5000);
  await context.setOffline(false);

  await expect.poll(() => current(page), { timeout: 15_000 }).toBeNull();
  const entry = (await entryNamed(page, "Half offline"))!;
  expect(Math.abs(Date.parse(entry.stop!) - pressedStop)).toBeLessThan(1500);
});

test("a stop the server rejects puts the running timer back, and Try again stops it", async ({
  page,
}) => {
  await signUp(page);
  await page.getByPlaceholder("What are you working on?").fill("Flaky stop");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect.poll(async () => (await current(page))?.description).toBe("Flaky stop");

  let fail = true;
  await page.route(/\/api\/time_entries\/[^/]+\/stop$/, (route) =>
    fail ? route.fulfill({ status: 500, body: '{"error":"Server unavailable"}' }) : route.continue()
  );
  await page.getByRole("button", { name: "Stop timer" }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "still running" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();

  fail = false;
  await page.locator("[data-sonner-toast]").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Start timer" })).toBeVisible();
  await expect.poll(() => current(page)).toBeNull();
});

test("an offline stop with no project still warns that the time can't be billed", async ({
  page,
  context,
}) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  await page.request.post("/api/projects", { data: { name: "EY Audit" }, headers: { origin } });
  await page.reload();
  await page.getByPlaceholder("What are you working on?").fill("Train work");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect.poll(async () => (await current(page))?.description).toBe("Train work");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Stop timer" }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "with no project" })
  ).toBeVisible();
  await context.setOffline(false);
});

test("Keep running works on a timer started and stopped offline", async ({ page, context }) => {
  await signUp(page);
  await expect(page.getByPlaceholder("What are you working on?")).toBeVisible();
  await context.setOffline(true);
  await page.getByPlaceholder("What are you working on?").fill("Offline undo");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop timer" }).click();
  await page
    .locator('header[aria-label="Timer controls"]')
    .getByRole("button", { name: /^Keep running/ })
    .click();
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  await context.setOffline(false);
  // The replay creates a running entry, not a stopped one.
  await expect.poll(async () => (await current(page))?.description ?? null, { timeout: 15_000 }).toBe("Offline undo");
});
