import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { signUp } from "./auth";
import { summarizeTime, type SummaryDb } from "../src/worker/lib/time-summary";

// The Assistant's "how much have I tracked?" counts a running timer up to now.
// Completed entries alone answered "0 hours today" five hours into a timer.
// The dev server and this suite share the local D1 file, so the real query
// runs against it directly.
const webDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function run<T>(command: string): T[] {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const out = execSync(
        `pnpm exec wrangler d1 execute time-tracker --local --json --command ${JSON.stringify(command)}`,
        { cwd: webDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return (JSON.parse(out) as Array<{ results: T[] }>)[0].results;
    } catch (e) {
      lastError = e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500 * (attempt + 1));
    }
  }
  throw lastError;
}

// D1's prepare/bind/all over the CLI. Every binding here is a string.
const localD1: SummaryDb = {
  prepare: (sql) => ({
    bind: (...values) => ({
      all: async <T,>() => {
        let i = 0;
        const inlined = sql.replace(/\?/g, () => `'${String(values[i++]).replace(/'/g, "''")}'`);
        return { results: run<T>(inlined.replace(/\s+/g, " ")) };
      },
    }),
  }),
};

test("a running timer counts toward tracked time, up to now or the range's end", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const H = 3600_000;

  const done = await page.request.post("/api/time_entries", {
    headers: { origin },
    data: { description: "Standup", start: iso(3 * H), stop: iso(2.5 * H) },
  });
  expect(done.ok()).toBeTruthy();
  const running = await page.request.post("/api/time_entries", {
    headers: { origin },
    data: { description: "Deep focus block", start: iso(2 * H) },
  });
  expect(running.ok()).toBeTruthy();
  const { workspaceId } = (await running.json()) as { workspaceId: string };

  const live = await summarizeTime(localD1, workspaceId, iso(24 * H), new Date(now + H).toISOString(), now);
  expect(live.runningSeconds).toBeGreaterThanOrEqual(2 * 3600 - 5);
  expect(live.runningSeconds).toBeLessThanOrEqual(2 * 3600 + 5);
  expect(live.totalSeconds - live.runningSeconds).toBe(30 * 60);

  // A range that ended an hour ago counts the timer only up to its end.
  const past = await summarizeTime(localD1, workspaceId, iso(24 * H), iso(H), now);
  expect(past.runningSeconds).toBeGreaterThanOrEqual(3600 - 5);
  expect(past.runningSeconds).toBeLessThanOrEqual(3600 + 5);
  expect(past.totalSeconds).toBe(past.runningSeconds + 30 * 60);
});
