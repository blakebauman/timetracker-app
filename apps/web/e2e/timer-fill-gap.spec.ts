import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The idle bar's "42m untracked" is an action: start the timer from the last
 * stop (the "I forgot to press Start" case), or log that stretch as an entry.
 */

async function seedGap(page: Page) {
  const origin = new URL(page.url()).origin;
  const stop = Date.now() - 42 * 60_000;
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
  await signUp(page);
  const stop = await seedGap(page);
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
  await signUp(page);
  await seedGap(page);
  await page.getByRole("button", { name: /untracked since .* fill the gap/ }).click();
  await page.getByRole("menuitem", { name: /^Log .* – now/ }).click();
  const sheet = page.getByRole("dialog", { name: "New entry" });
  await expect(sheet).toBeVisible();
});
