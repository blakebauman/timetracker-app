import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// The requireFreshSession middleware (middleware/fresh-session.ts) re-imposes a
// fresh-session gate on /update-user and /unlink-account. A just-signed-up
// session is fresh, so legitimate profile updates must still pass through the
// middleware — this guards against it over-blocking. (Better Auth enforces its
// own Origin/CSRF check on these endpoints, so the request must carry Origin,
// exactly as the real browser client sends it.)
test.describe("sensitive account mutations", () => {
  test("a fresh session passes the freshness gate on update-user", async ({ page, baseURL }) => {
    await signUp(page);

    const res = await page.request.post("/api/auth/update-user", {
      headers: { Origin: baseURL! },
      data: { name: "Renamed User" },
    });

    // 200 proves the middleware let the fresh session reach Better Auth, which
    // accepted it. A middleware over-block would surface as 403 SESSION_NOT_FRESH.
    expect(res.status()).toBe(200);
  });
});
