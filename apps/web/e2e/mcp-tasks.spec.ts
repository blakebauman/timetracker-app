import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Task tools over MCP: the same lib/tasks.ts the app uses, so a task created
 * or completed from a chat window obeys the app's rules (repeats spawn their
 * next occurrence, a timer on a task starts it and inherits its tags).
 */

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

function parseRpc(text: string): Record<string, unknown> {
  const line = text
    .split("\n")
    .map((l) => l.replace(/^data:\s*/, "").trim())
    .find((l) => l.startsWith("{"));
  if (!line) throw new Error(`No JSON-RPC payload in response: ${text.slice(0, 200)}`);
  return JSON.parse(line);
}

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function mcpClient(page: Page, scope: "read" | "read_write") {
  const origin = new URL(page.url()).origin;
  const created = await page.request.post("/api/keys", {
    headers: { origin },
    data: { name: `e2e ${scope}`, scope },
  });
  const { plaintext } = (await created.json()) as { plaintext: string };
  const headers = { ...MCP_HEADERS, Authorization: `Bearer ${plaintext}` };
  let id = 0;
  const rpc = async (method: string, params?: Record<string, unknown>) =>
    parseRpc(
      await (await page.request.post("/mcp", { headers, data: { jsonrpc: "2.0", id: ++id, method, params } })).text()
    );
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await rpc("tools/call", { name, arguments: args })) as {
      result: { content: { text: string }[] };
    };
    return res.result.content[0].text;
  };
  const toolNames = async () =>
    ((await rpc("tools/list")).result as { tools: { name: string }[] }).tools.map((t) => t.name);
  return { call, toolNames, origin };
}

async function seedProject(page: Page) {
  const origin = new URL(page.url()).origin;
  return (await (
    await page.request.post("/api/projects", { data: { name: "ERP Migration", color: "#e11d48" }, headers: { origin } })
  ).json()) as { id: string };
}

test("a read key can list tasks but isn't shown the task write tools", async ({ page }) => {
  await signUp(page);
  const { toolNames } = await mcpClient(page, "read");
  const names = await toolNames();
  expect(names).toContain("list_tasks");
  expect(names).not.toContain("create_task");
  expect(names).not.toContain("complete_task");
});

test("create, list, track and complete a task over MCP", async ({ page }) => {
  await signUp(page);
  const project = await seedProject(page);
  const { call, toolNames } = await mcpClient(page, "read_write");
  expect(await toolNames()).toEqual(expect.arrayContaining(["list_tasks", "create_task", "complete_task"]));

  // A bad project id is a readable refusal, not a 500.
  expect(await call("create_task", { name: "Nope", projectId: "no-such-project" })).toContain("Project not found");

  const created = JSON.parse(
    await call("create_task", {
      name: "Stand-up notes",
      projectId: project.id,
      dueDate: localDate(0),
      scheduledTime: "09:30",
      estimateMinutes: 15,
      tags: ["ceremonies"],
    })
  ) as { id: string; scheduledTime: string; tags: string[]; estimateHours: number };
  expect(created).toMatchObject({ scheduledTime: "09:30", tags: ["ceremonies"], estimateHours: 0.25 });

  const due = JSON.parse(await call("list_tasks", { dueBy: localDate(0) })) as { name: string }[];
  expect(due.map((t) => t.name)).toEqual(["Stand-up notes"]);

  // A timer on the task: the entry carries the task and its tags, and the
  // task moves to In progress — the same as starting it in the app.
  expect(await call("start_timer", { description: "Stand-up notes", taskId: created.id })).toContain("Started");
  const current = await (await page.request.get("/api/time_entries/current")).json();
  expect(current).toMatchObject({ taskId: created.id, projectId: project.id, tags: ["ceremonies"] });
  const tasks = (await (await page.request.get("/api/tasks")).json()) as { id: string; startedAt: string | null }[];
  expect(tasks.find((t) => t.id === created.id)?.startedAt).not.toBeNull();

  // Completing is idempotent, and reports honestly.
  const offset = new Date().getTimezoneOffset();
  expect(await call("complete_task", { taskId: created.id, timezoneOffsetMinutes: offset })).toBe(
    'Completed "Stand-up notes". A timer is still running on it.'
  );
  expect(await call("complete_task", { taskId: created.id, timezoneOffsetMinutes: offset })).toContain("already done");
});

test("completing a repeating task over MCP spawns its next occurrence", async ({ page }) => {
  await signUp(page);
  const project = await seedProject(page);
  const origin = new URL(page.url()).origin;
  const task = await (
    await page.request.post("/api/tasks", {
      data: { name: "Timesheet", projectId: project.id, dueDate: localDate(0), recurRule: "daily" },
      headers: { origin },
    })
  ).json();
  const { call } = await mcpClient(page, "read_write");

  const reply = await call("complete_task", {
    taskId: task.id,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
  expect(reply).toContain(`next one is due ${localDate(1)}`);
  const open = JSON.parse(await call("list_tasks", {})) as { name: string; dueDate: string; repeats: string }[];
  expect(open).toEqual([expect.objectContaining({ name: "Timesheet", dueDate: localDate(1), repeats: "daily" })]);
});
