import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

declare global {
  interface Window {
    __wsMessages?: string[];
  }
}

// Cross-session activity relay for idle detection (TimerRoom): local input
// while a timer runs is sent as a throttled heartbeat and relayed to the same
// user's OTHER sockets as `user_activity`, so their idle detection knows the
// user is active elsewhere. A raw second WebSocket on the same session cookie
// stands in for "another device".
test("activity heartbeat reaches the user's other sessions", async ({ page }) => {
  await signUp(page);

  // Open the observer socket BEFORE starting the timer: the first post-start
  // activity sends immediately, but the 30s throttle would swallow a second
  // send if the first fired while nobody was listening.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${proto}//${location.host}/api/ws`);
        window.__wsMessages = [];
        ws.onmessage = (e) => window.__wsMessages!.push(String(e.data));
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("observer socket failed to open"));
      })
  );

  // Heartbeats are gated on a running timer — an idle workspace stays silent.
  await page.getByPlaceholder("What are you working on?").fill("Relay test entry");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

  // Real user input (not synthetic dispatch) so the window listener fires — and
  // re-emitted on every poll round rather than once up front. The heartbeat is
  // dropped outright if the app's own socket isn't OPEN yet, *without* consuming
  // the 30s throttle, so under parallel load a single nudge could land before the
  // connection and then nothing would ever arrive.
  let x = 200;
  await expect
    .poll(
      async () => {
        x = x === 200 ? 400 : 200;
        await page.mouse.move(x, 300);
        return page.evaluate(() =>
          (window.__wsMessages ?? []).some((m) => {
            try {
              return (JSON.parse(m) as { event?: string }).event === "user_activity";
            } catch {
              return false;
            }
          })
        );
      },
      { timeout: 10_000 }
    )
    .toBe(true);
});
