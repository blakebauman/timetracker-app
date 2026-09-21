import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// Request-shape hardening: bounded bulk ids and filters (D1 stops at 100
// bound parameters, so an unbounded list was a 500 for the price of one
// request), a body-size ceiling, JSON 404s, and validation errors that carry
// the reason without echoing what was sent.
test.describe("input limits", () => {
  test("a bulk edit over the id cap is refused with a reason, not an echo", async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    const ids = Array.from({ length: 91 }, (_, i) => `id-${i}-SENTINEL`);

    const res = await page.request.patch("/api/time_entries/bulk", {
      headers: { origin },
      data: { ids, patch: { billable: true } },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: string; issues: Array<{ path: string[]; message: string }> };
    expect(body.error).toMatch(/at most|too big|<=|90/i);
    expect(body.issues[0].path).toEqual(["ids"]);
    // The rejected values never come back.
    expect(JSON.stringify(body)).not.toContain("SENTINEL");

    // 90 is fine (the ids just don't match anything).
    const ok = await page.request.patch("/api/time_entries/bulk", {
      headers: { origin },
      data: { ids: ids.slice(0, 90), patch: { billable: true } },
    });
    expect(ok.status()).toBe(200);
  });

  test("a report filter with too many ids is a 400, not a 500", async ({ page }) => {
    await signUp(page);
    const many = Array.from({ length: 120 }, (_, i) => `p${i}`).join(",");
    const res = await page.request.get(
      `/api/reports/summary?since=2026-01-01T00:00:00.000Z&until=2026-12-31T00:00:00.000Z&projectIds=${many}`
    );
    expect(res.status()).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/at most/i);
  });

  test("an oversized body is a 413 before anything parses it", async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    // The auth surface has the tighter cap (64 KiB), so a 96 KiB body trips the
    // same body-limit middleware while still fitting in a socket buffer. The
    // worker answers from Content-Length without reading the body; with a
    // multi-megabyte payload the Vite dev proxy on Linux tears the connection
    // down mid-write ("fetch failed" → 500) — an artifact of the proxy, not the
    // limit, and one the Cloudflare edge doesn't have.
    const res = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin, "content-type": "application/json" },
      data: JSON.stringify({ email: "nobody@example.com", password: "x".repeat(96 * 1024) }),
    });
    expect(res.status()).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
  });

  test("unknown API paths are JSON 404s, and validation keeps its message", async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;

    const missing = await page.request.get("/api/definitely-not-a-route");
    expect(missing.status()).toBe(404);
    expect(await missing.json()).toEqual({ error: "Not found" });

    // The single most likely validation failure in the app: the message the
    // user sees is the reason, and the payload carries no received values.
    const inverted = await page.request.post("/api/time_entries", {
      headers: { origin },
      data: {
        description: "Backwards SENTINEL",
        start: "2026-09-16T12:00:00.000Z",
        stop: "2026-09-16T11:00:00.000Z",
      },
    });
    expect(inverted.status()).toBe(400);
    const body = (await inverted.json()) as { error: string };
    expect(body.error).toBe("Stop time must be after start time");
    expect(JSON.stringify(body)).not.toContain("SENTINEL");
  });

  test("the agent and MCP surfaces carry the security headers", async ({ page }) => {
    await signUp(page);
    const agent = await page.request.get("/agents/chat-agent/x/get-messages");
    expect(agent.status()).toBe(200);
    expect(agent.headers()["x-content-type-options"]).toBe("nosniff");
    expect(agent.headers()["cache-control"]).toBe("no-store");

    const mcp = await page.request.post("/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(mcp.status()).toBe(401);
    expect(mcp.headers()["x-content-type-options"]).toBe("nosniff");
  });
});
