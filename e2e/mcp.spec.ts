import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

/** The MCP transport answers over SSE frames; pull the JSON-RPC body out. */
function parseRpc(text: string): Record<string, unknown> {
  const line = text
    .split("\n")
    .map((l) => l.replace(/^data:\s*/, "").trim())
    .find((l) => l.startsWith("{"));
  if (!line) throw new Error(`No JSON-RPC payload in response: ${text.slice(0, 200)}`);
  return JSON.parse(line);
}

test("mcp: rejects a request with no API key", async ({ page }) => {
  await signUp(page);
  const res = await page.request.post("/mcp", {
    headers: MCP_HEADERS,
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(res.status()).toBe(401);
  expect(res.headers()["www-authenticate"]).toContain("Bearer");
});

test("mcp: a read-only key gets the read tools and none of the write tools", async ({
  page,
}) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;

  const created = await page.request.post("/api/keys", {
    headers: { origin },
    data: { name: "e2e read", scope: "read" },
  });
  expect(created.status()).toBe(201);
  const { plaintext, key } = (await created.json()) as {
    plaintext: string;
    key: { prefix: string };
  };
  // The secret is returned once and never again; the list only ever shows the
  // display prefix.
  expect(plaintext.startsWith("tt_live_")).toBeTruthy();
  const listed = (await (await page.request.get("/api/keys")).json()) as Record<
    string,
    unknown
  >[];
  expect(JSON.stringify(listed)).not.toContain(plaintext);
  expect(listed[0].prefix).toBe(key.prefix);

  const auth = { ...MCP_HEADERS, Authorization: `Bearer ${plaintext}` };

  const init = parseRpc(
    await (
      await page.request.post("/mcp", {
        headers: auth,
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "e2e", version: "1" },
          },
        },
      })
    ).text()
  );
  expect((init.result as { serverInfo: { name: string } }).serverInfo.name).toBe(
    "timetracker"
  );

  const tools = parseRpc(
    await (
      await page.request.post("/mcp", {
        headers: auth,
        data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
      })
    ).text()
  );
  const names = (tools.result as { tools: { name: string }[] }).tools.map((t) => t.name);
  expect(names).toContain("get_time_summary");
  expect(names).toContain("get_project_pacing");
  // A read key isn't shown the write tools at all — not shown-then-refused.
  expect(names).not.toContain("start_timer");
  expect(names).not.toContain("log_time");
});

test("mcp: a revoked key stops working immediately", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;

  const created = await page.request.post("/api/keys", {
    headers: { origin },
    data: { name: "e2e revoke", scope: "read" },
  });
  const { plaintext, key } = (await created.json()) as {
    plaintext: string;
    key: { id: string };
  };
  const auth = { ...MCP_HEADERS, Authorization: `Bearer ${plaintext}` };

  const before = await page.request.post("/mcp", {
    headers: auth,
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(before.status()).toBe(200);

  const revoked = await page.request.delete(`/api/keys/${key.id}`, { headers: { origin } });
  expect(revoked.ok()).toBeTruthy();

  const after = await page.request.post("/mcp", {
    headers: auth,
    data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  expect(after.status()).toBe(401);
});
