import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * TimerRoom used to complete the WebSocket close handshake by hand, because on
 * compatibility dates before 2026-04-07 failing to reciprocate a Close frame
 * leaves the client with a 1006 abnormal closure. From that date
 * `web_socket_auto_reply_to_close` is on by default and the runtime replies for
 * us, so the handler was removed.
 *
 * This asserts the behaviour the handler existed to guarantee, rather than the
 * handler itself: close the socket from the client and require a clean 1000.
 *
 * Read this before trusting it: **this test cannot fail locally**, whatever the
 * server does. The local runtime reciprocates the Close frame regardless of
 * compatibility date or handler — verified by removing the handler and dropping
 * the date back to `2025-10-08` against a fresh dev server; still passed.
 *
 * That blind spot has already cost once. #88 removed `webSocketClose` on the
 * strength of the docs plus this test, and production then returned
 * `1006 / wasClean: false` — nothing was reciprocating. The handler is back.
 *
 * So: this guards the client contract in CI, but the only thing that actually
 * verifies close behaviour is a probe against the deployed worker:
 *
 *   const ws = new WebSocket("wss://timetracker.run/api/ws");   // authenticated tab
 *   ws.onopen = () => ws.close(1000, "probe");
 *   ws.onclose = (e) => console.log(e.code, e.wasClean);        // want 1000, true
 */
test("closing a timer socket completes the handshake cleanly", async ({ page }) => {
  await signUp(page);

  const result = await page.evaluate(
    () =>
      new Promise<{ code: number; wasClean: boolean }>((resolve, reject) => {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${proto}//${location.host}/api/ws`);
        ws.onopen = () => ws.close(1000, "done");
        ws.onclose = (e) => resolve({ code: e.code, wasClean: e.wasClean });
        ws.onerror = () => reject(new Error("observer socket errored"));
        setTimeout(() => reject(new Error("socket never closed")), 10_000);
      })
  );

  // 1006 here means nothing reciprocated the Close frame.
  expect(result.code).toBe(1000);
  expect(result.wasClean).toBe(true);
});
