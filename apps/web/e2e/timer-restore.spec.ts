import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

/**
 * On every page load the running timer used to be restored asynchronously
 * (IndexedDB, then `/current`), and until then the bar rendered *idle* with a
 * live Start. Pressing Enter in that window started a new timer, which the
 * server treats as "stop the running one" — opening the app could end the
 * very timer it was about to show.
 */

async function holdCurrent(page: Page, ms: number) {
  await page.route(
    (url) => url.pathname === "/api/time_entries/current",
    async (route) => {
      await new Promise((r) => setTimeout(r, ms));
      await route.continue();
    }
  );
}

async function current(page: Page) {
  return (await (await page.request.get("/api/time_entries/current")).json()) as {
    id: string;
    description: string;
  } | null;
}

test("a reload shows the running timer before the server answers, without announcing it", async ({
  page,
}) => {
  await signUp(page);
  await page.getByPlaceholder("What are you working on?").fill("Billable work");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect.poll(async () => (await current(page))?.description).toBe("Billable work");

  await holdCurrent(page, 3000);
  await page.reload();
  // Seeded from the local mirror: Stop is there long before /current returns.
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible({ timeout: 1500 });
  await expect(page.getByRole("button", { name: "Start timer" })).toHaveCount(0);
  // A restore is not the user starting anything.
  await page.waitForTimeout(3500);
  await expect(page.locator('p[role="status"][aria-live="polite"]').first()).toHaveText("");
});

test("with no local record, a start pressed during the restore doesn't stop the real timer", async ({
  page,
}) => {
  await signUp(page);
  // A timer running server-side that this browser doesn't know about — started
  // on another device.
  const origin = new URL(page.url()).origin;
  await page.request.post("/api/time_entries", {
    data: { description: "Started elsewhere", start: new Date(Date.now() - 60 * 60e3).toISOString() },
    headers: { origin },
  });
  const running = (await current(page))!;

  // Hold both the list and /current, so nothing on the page knows yet.
  // "No local record": clear the mirror before the app loads. Clearing it
  // from the live page races that page's own persistence of the timer.
  await page.addInitScript(() => localStorage.removeItem("tt-running-timer"));
  await holdCurrent(page, 2500);
  await page.route(
    (url) => url.pathname === "/api/time_entries",
    async (route) => {
      if (route.request().method() === "GET") await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    }
  );
  await page.reload();
  const desc = page.getByPlaceholder("What are you working on?");
  await desc.fill("Oops");
  await desc.press("Enter");
  await expect(page.getByRole("button", { name: "Start timer" })).toHaveAttribute("aria-busy", "true");

  // Once the restore lands, it's the real timer that's running — untouched —
  // and what was typed is offered for it rather than thrown away.
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible({ timeout: 8000 });
  const notice = page.locator("[data-sonner-toast]").filter({ hasText: "already running" });
  await expect(notice).toContainText('"Oops" wasn\'t started');
  expect((await current(page))?.id).toBe(running.id);
  await notice.getByRole("button", { name: "Use as its description" }).click();
  await expect(page.getByRole("combobox", { name: "Description" })).toHaveValue("Oops");
  await expect.poll(async () => (await current(page))?.description, { timeout: 5000 }).toBe("Oops");
});

test("a start pressed during the restore happens, at the press, once nothing is found running", async ({
  page,
}) => {
  await signUp(page);
  await holdCurrent(page, 2000);
  await page.reload();
  const desc = page.getByPlaceholder("What are you working on?");
  await desc.fill("Held start");
  const pressed = Date.now();
  await desc.press("Enter");
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible({ timeout: 6000 });
  await expect.poll(async () => (await current(page))?.description, { timeout: 10_000 }).toBe("Held start");
  const started = (await (await page.request.get("/api/time_entries/current")).json()) as { start: string };
  expect(Math.abs(Date.parse(started.start) - pressed)).toBeLessThan(1500);
});

test("with no local record, the bar takes the running entry from the list before /current answers", async ({
  page,
}) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  await page.request.post("/api/time_entries", {
    data: { description: "From another device", start: new Date(Date.now() - 30 * 60e3).toISOString() },
    headers: { origin },
  });
  // "No local record": clear the mirror before the app loads. Clearing it
  // from the live page races that page's own persistence of the timer.
  await page.addInitScript(() => localStorage.removeItem("tt-running-timer"));
  await holdCurrent(page, 4000);
  await page.reload();
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole("combobox", { name: "Description" })).toHaveValue("From another device");
});
