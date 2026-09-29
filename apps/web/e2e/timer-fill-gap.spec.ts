import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The idle bar's "42m untracked" is an action: start the timer from the last
 * stop (the "I forgot to press Start" case), or log that stretch as an entry.
 */

/**
 * Noon today, local. The gap is "untracked since the last stop *today*", so a
 * seed measured back from the real clock fell into yesterday for anyone
 * running this in the first ~2h after midnight — CI runs in UTC, and failed
 * every night at 00:35. The page's clock is pinned here and the seed hangs off
 * it, so the stretch is always inside today.
 */
function noonToday(): number {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

async function pinClock(page: Page) {
  const now = noonToday();
  await page.clock.install({ time: now });
  return now;
}

async function seedGap(page: Page, now: number) {
  const origin = new URL(page.url()).origin;
  const stop = now - 42 * 60_000;
  await page.request.post("/api/time_entries", {
    data: { description: "Morning block", start: new Date(stop - 3600e3).toISOString(), stop: new Date(stop).toISOString() },
    headers: { origin },
  });
  await page.reload();
  return stop;
}

async function current(page: Page) {
  return (await (await page.request.get("/api/time_entries/current")).json()) as {
    description: string;
    start: string;
  } | null;
}

test("Start timer from the last stop backdates the timer to it", async ({ page }) => {
  const now = await pinClock(page);
  await signUp(page);
  const stop = await seedGap(page, now);
  await page.getByPlaceholder("What are you working on?").fill("Client prep");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /untracked since .* fill the gap/ }).click();
  await page.getByRole("menuitem", { name: /^Start timer from/ }).click();

  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  await expect.poll(async () => (await current(page))?.description).toBe("Client prep");
  const started = (await current(page))!;
  expect(Math.abs(Date.parse(started.start) - stop)).toBeLessThan(1500);
  // The readout picks up from there, not from zero.
  await expect(page.getByRole("button", { name: /elapsed — edit/ })).toHaveAttribute("aria-label", /^4\dm elapsed/);
});

test("Log the gap opens a new entry covering it", async ({ page }) => {
  const now = await pinClock(page);
  await signUp(page);
  await seedGap(page, now);
  await page.getByRole("button", { name: /untracked since .* fill the gap/ }).click();
  await page.getByRole("menuitem", { name: /^Log .* – now/ }).click();
  const sheet = page.getByRole("dialog", { name: "New entry" });
  await expect(sheet).toBeVisible();
});
