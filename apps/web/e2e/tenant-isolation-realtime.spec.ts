import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

declare global {
  interface Window {
    __wsMessages?: string[];
  }
}

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

function parseRpc(text: string): { result?: Record<string, unknown>; error?: unknown } {
  const line = text
    .split("\n")
    .map((l) => l.replace(/^data:\s*/, "").trim())
    .find((l) => l.startsWith("{"));
  if (!line) throw new Error(`No JSON-RPC payload in response: ${text.slice(0, 200)}`);
  return JSON.parse(line);
}

// The tenant boundary on the surfaces the IDOR suite does not touch: the two
// WebSocket upgrades (cross-site origin, and one workspace's traffic reaching
// another's socket), a workspace API key used against MCP, and saved reports.
test.describe("tenant isolation — realtime, API keys, saved reports", () => {
  test("the timer socket route insists on an upgrade", async ({ page }) => {
    await signUp(page);
    // The Origin gate on the two upgrade paths (403 for a foreign Origin) can
    // only be observed against production: the Vite dev proxy takes over any
    // request carrying `Upgrade: websocket` before the worker can answer it.
    // docs/RUNBOOK.md lists the curl. What can be asserted here is the route's
    // first refusal.
    expect((await page.request.get("/api/ws")).status()).toBe(426);
  });

  test("workspace A's timer traffic never reaches workspace B's socket", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signUp(pageA);
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signUp(pageB);

    // B listens on its workspace room (a real browser socket, so Origin is set).
    await pageB.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const proto = location.protocol === "https:" ? "wss:" : "ws:";
          const ws = new WebSocket(`${proto}//${location.host}/api/ws`);
          window.__wsMessages = [];
          ws.onmessage = (e) => window.__wsMessages!.push(String(e.data));
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error("socket failed to open"));
        }),
    );

    // A starts and stops a timer — two broadcasts into A's room.
    const started = await pageA.request.post("/api/time_entries", {
      data: { description: "A-only SENTINEL", start: new Date().toISOString() },
    });
    expect(started.ok()).toBeTruthy();
    const { id } = (await started.json()) as { id: string };
    await pageA.request.post(`/api/time_entries/${id}/stop`);

    // Give the fan-out a moment, then assert B heard nothing about it.
    await pageB.waitForTimeout(1500);
    const heard = await pageB.evaluate(() => window.__wsMessages ?? []);
    expect(heard.join("\n")).not.toContain("SENTINEL");
    expect(heard.filter((m) => m.includes("timer:"))).toEqual([]);

    await ctxA.close();
    await ctxB.close();
  });

  test("a workspace API key sees only its own workspace through MCP", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signUp(pageA);
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signUp(pageB);

    const originA = new URL(pageA.url()).origin;
    const originB = new URL(pageB.url()).origin;
    expect((await pageA.request.post("/api/projects", { headers: { origin: originA }, data: { name: "Project SENTINEL-A", color: "#e11d48" } })).ok()).toBeTruthy();
    expect((await pageB.request.post("/api/projects", { headers: { origin: originB }, data: { name: "Project B", color: "#0ea5e9" } })).ok()).toBeTruthy();

    const created = await pageB.request.post("/api/keys", {
      headers: { origin: originB },
      data: { name: "e2e cross", scope: "read" },
    });
    expect(created.status()).toBe(201);
    const { plaintext } = (await created.json()) as { plaintext: string };
    const auth = { ...MCP_HEADERS, Authorization: `Bearer ${plaintext}` };

    await pageB.request.post("/mcp", {
      headers: auth,
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
    });
    const call = parseRpc(
      await (
        await pageB.request.post("/mcp", {
          headers: auth,
          data: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_projects", arguments: {} } },
        })
      ).text(),
    );
    const text = JSON.stringify(call.result ?? call.error);
    expect(text).toContain("Project B");
    expect(text).not.toContain("SENTINEL-A");

    await ctxA.close();
    await ctxB.close();
  });

  test("saved reports do not cross workspaces", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signUp(pageA);
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signUp(pageB);

    const originA = new URL(pageA.url()).origin;
    const created = await pageA.request.post("/api/saved-reports", {
      headers: { origin: originA },
      data: { name: "Report SENTINEL", config: { range: "week" } },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const listB = (await (await pageB.request.get("/api/saved-reports")).json()) as Array<{ name: string }>;
    expect(listB.map((r) => r.name)).not.toContain("Report SENTINEL");
    // Deleting by id from the other workspace is a 404, not a delete.
    const del = await pageB.request.delete(`/api/saved-reports/${id}`, { headers: { origin: new URL(pageB.url()).origin } });
    expect(del.status()).toBe(404);
    const listA = (await (await pageA.request.get("/api/saved-reports")).json()) as Array<{ name: string }>;
    expect(listA.map((r) => r.name)).toContain("Report SENTINEL");

    await ctxA.close();
    await ctxB.close();
  });
});
