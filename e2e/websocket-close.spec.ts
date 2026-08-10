import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * TimerRoomDO used to complete the WebSocket close handshake by hand, because on
 * compatibility dates before 2026-04-07 failing to reciprocate a Close frame
 * leaves the client with a 1006 abnormal closure. From that date
 * `web_socket_auto_reply_to_close` is on by default and the runtime replies for
 * us, so the handler was removed.
 *
 * This asserts the behaviour the handler existed to guarantee, rather than the
 * handler itself: close the socket from the client and require a clean 1000.
 *
 * Caveat worth knowing before you trust it as a compat-date guard: it does NOT
 * discriminate compatibility dates locally. Checked directly — with the handler
 * removed it still passes on the old `2025-10-08` date against a freshly
 * started dev server, so the local runtime reciprocates regardless and 1006 is
 * not reproducible here. It is a regression test for clean closure, not proof
 * that the flag is what delivers it.
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
