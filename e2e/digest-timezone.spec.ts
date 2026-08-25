import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * The digest cron has no request to read a timezone from, so it works off the
 * offset stored on the user row. If that is never set, "yesterday" is computed
 * in UTC — which for a user west of UTC reports *today's* hours under a
 * "Yesterday" heading. That actually shipped and reached a real inbox.
 *
 * A preview send is often the first time anyone touches digests at all, so it
 * is also the first chance to learn which timezone their "8am" means. This pins
 * that the client's offset is both used and persisted.
 */
test("digest preview persists the caller's timezone offset", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;

  const before = await (await page.request.get("/api/settings")).json();
  expect(before.digestTimezoneOffsetMinutes).toBe(0); // never set on a new account

  // A deliberately non-zero, non-local offset so a pass can't come from the
  // test machine happening to sit in UTC.
  const offset = 420; // UTC-7
  const res = await page.request.post("/api/settings/digest/send", {
    headers: { origin },
    data: { kind: "daily", timezoneOffsetMinutes: offset },
  });
  // The send itself may fail in CI (no verified destination address); what has
  // to hold is that the offset was recorded either way it is reached.
  expect([200, 502]).toContain(res.status());

  const after = await (await page.request.get("/api/settings")).json();
  expect(after.digestTimezoneOffsetMinutes).toBe(offset);
});
