import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Discard has always had a confirm; a mis-stop had nothing, and recovering
 * cost a Continue plus a start-time edit. Every Stop now ends on a receipt
 * with a five-second "Keep running" that reopens the same entry.
 */

async function current(page: Page) {
  return (await (await page.request.get("/api/time_entries/current")).json()) as {
    id: string;
    start: string;
    stop: string | null;
    duration: number | null;
  } | null;
}

test("Keep running reopens the stopped entry from its original start", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await (
    await page.request.post("/api/projects", { data: { name: "EY Audit" }, headers: { origin } })
  ).json();
  await page.reload();

  const desc = page.getByPlaceholder("What are you working on?");
  await desc.fill("Fieldwork");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select project" }).click();
  await page.getByRole("option", { name: /EY Audit/ }).click();
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect.poll(async () => (await current(page))?.id ?? null).not.toBeNull();
  const started = (await current(page))!;

  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop timer" }).click();
  const receipt = page.locator("[data-sonner-toast]").filter({ hasText: "Saved" });
  await expect(receipt).toContainText("EY Audit");
  await expect.poll(() => current(page)).toBeNull();

  await receipt.getByRole("button", { name: "Keep running" }).click();
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  await expect.poll(async () => (await current(page))?.id).toBe(started.id);
  const reopened = (await current(page))!;
  expect(reopened.start).toBe(started.start);
  expect(reopened.stop).toBeNull();
  expect(reopened.duration).toBeNull();
  void project;
});

test("the server refuses to reopen an entry while another timer runs", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const h = { origin };
  const now = Date.now();
  const done = await (
    await page.request.post("/api/time_entries", {
      data: { description: "Earlier", start: new Date(now - 3600e3).toISOString(), stop: new Date(now - 1800e3).toISOString() },
      headers: h,
    })
  ).json();
  await page.request.post("/api/time_entries", {
    data: { description: "Now", start: new Date(now - 60e3).toISOString() },
    headers: h,
  });
  const res = await page.request.put(`/api/time_entries/${done.id}`, { data: { stop: null }, headers: h });
  expect(res.status()).toBe(409);
});

test("the bar offers Keep running beside the disc, and Alt+Shift+R takes it", async ({ page }) => {
  await signUp(page);
  await page.getByPlaceholder("What are you working on?").fill("Pill check");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect.poll(async () => (await current(page))?.id ?? null).not.toBeNull();
  const started = (await current(page))!;
  await page.getByRole("button", { name: "Stop timer" }).click();

  const bar = page.locator('header[aria-label="Timer controls"]');
  await expect(bar.getByRole("button", { name: /^Keep running/ })).toBeVisible();
  await expect.poll(() => current(page)).toBeNull();
  await page.keyboard.press("Alt+Shift+R");
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  await expect.poll(async () => (await current(page))?.id).toBe(started.id);
});

test("another tab sees a reopened timer", async ({ page, context }) => {
  await signUp(page);
  const tabB = await context.newPage();
  await tabB.goto("/");
  await expect(tabB.getByRole("button", { name: "Start timer" })).toBeVisible();

  await page.bringToFront();
  await page.getByPlaceholder("What are you working on?").fill("Two tabs");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect(tabB.getByRole("button", { name: "Stop timer" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Stop timer" }).click();
  await expect(tabB.getByRole("button", { name: "Start timer" })).toBeVisible({ timeout: 10_000 });

  await page.bringToFront();
  await page
    .locator('header[aria-label="Timer controls"]')
    .getByRole("button", { name: /^Keep running/ })
    .click();
  await expect(tabB.getByRole("button", { name: "Stop timer" })).toBeVisible({ timeout: 10_000 });
});
