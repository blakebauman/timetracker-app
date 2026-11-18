import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

// The Assistant panel's rendering of a thread: tool calls as trace steps,
// approvals outside the trace, and the thread opening at its end. The history
// is served as a fixture through the agent's `get-messages` endpoint (the
// HTTP read the chat makes before its socket opens), so nothing here waits on
// the model — the live round-trip is guarded by workers-ai-stream.spec.ts.

function at(h: number, m: number): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const THREAD = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "Log 90 minutes to Acme for this morning's design review" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      // A lookup the model read on the way: folded to one line.
      {
        type: "tool-listProjects",
        toolCallId: "c1",
        state: "output-available",
        input: {},
        output: { projects: [{ name: "Acme Retainer", billable: true }] },
      },
      {
        type: "tool-logTimeEntry",
        toolCallId: "c2",
        state: "output-error",
        input: { description: "Design review", projectName: "Acme Retainer" },
        errorText: "D1 was busy",
      },
      // A write's receipt: open, drawn as the entry row it created.
      {
        type: "tool-logTimeEntry",
        toolCallId: "c3",
        state: "output-available",
        input: { description: "Design review", projectName: "Acme Retainer", start: at(9, 0), stop: at(10, 30) },
        output: { ok: true, project: "Acme Retainer", durationSeconds: 5400 },
      },
      {
        type: "tool-getTimeSummary",
        toolCallId: "c6",
        state: "output-available",
        input: {},
        output: { totalSeconds: 106200, byProject: [{ project: "Acme Retainer", seconds: 72000 }, { project: "Internal", seconds: 34200 }] },
      },
      // A fence grows after first paint (its grammar loads, then highlights).
      {
        type: "text",
        text: "Logged **1h 30m** to Acme Retainer.\n\n```sql\nSELECT project, SUM(duration) AS seconds\nFROM time_entries\nGROUP BY project;\n```",
      },
    ],
  },
  { id: "u2", role: "user", parts: [{ type: "text", text: "Plan my day" }] },
  {
    id: "a2",
    role: "assistant",
    // The turn ended before the tool did (a dropped socket, a stopped reply).
    parts: [{ type: "tool-planDay", toolCallId: "c4", state: "input-available", input: {} }],
  },
  { id: "u3", role: "user", parts: [{ type: "text", text: "Add a task to send the Acme invoice on Friday" }] },
  {
    id: "a3",
    role: "assistant",
    parts: [
      {
        type: "tool-createTask",
        toolCallId: "c5",
        state: "approval-requested",
        input: { name: "Send Acme invoice", projectName: "Acme Retainer", dueDate: "2026-11-20" },
        approval: { id: "ap1" },
      },
    ],
  },
];

async function openWithThread(page: Page) {
  await signUp(page);
  await page.request.post("/api/projects", { data: { name: "Acme Retainer", color: "#2563eb" } });
  await page.route("**/get-messages**", (route) => route.fulfill({ json: THREAD }));
  await page.goto("/");
  await page.getByRole("button", { name: /^Assistant/ }).filter({ visible: true }).first().click();
  const panel = page.getByRole("dialog", { name: "Assistant" });
  await expect(panel.getByText("Logged 1h 30m to Acme Retainer.")).toBeVisible();
  return panel;
}

test("tool calls render as trace steps: done, folded, failed, unfinished", async ({ page }) => {
  const panel = await openWithThread(page);

  // A finished write: past tense, open, its row the entry it logged.
  const logged = panel.getByRole("button", { name: "Logged time" });
  await expect(logged).toHaveAttribute("aria-expanded", "true");
  const row = panel.locator('[data-slot="item"]', { hasText: "Design review" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("1h 30m");
  await expect(row).toContainText("Acme Retainer");

  // A lookup: one line until asked.
  const lookup = panel.getByRole("button", { name: "Looked up projects" });
  await expect(lookup).toHaveAttribute("aria-expanded", "false");
  await lookup.click();
  await expect(lookup).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByText("1 project", { exact: true })).toBeVisible();

  await expect(panel.getByText("Log time didn't go through")).toBeVisible();

  // A step its turn left behind says so, rather than shimmering forever.
  await expect(panel.getByText("Plan the day didn't finish")).toBeVisible();
  await expect(panel.getByText("Planning your day…")).toHaveCount(0);
});

test("an approval is a sentence and a verb, outside the trace", async ({ page }) => {
  const panel = await openWithThread(page);
  const approval = panel.getByRole("group", { name: "Waiting for your approval" });
  await expect(approval).toContainText("Add Send Acme invoice to Acme Retainer");
  await expect(approval.getByRole("button", { name: "Add task" })).toBeVisible();
  await expect(approval.getByRole("button", { name: "Decline" })).toBeVisible();
  // Not a step: no trace line names the pending call.
  await expect(panel.getByRole("button", { name: /Added a task/ })).toHaveCount(0);
});

test("a reopened thread lands on its newest turn", async ({ page }) => {
  const panel = await openWithThread(page);
  // The behaviour, not a reproduction: the panel once opened short of its
  // end with the newest turn and its approval below the fold, under timing
  // this suite hasn't been able to recreate (the fix, autoScroll on the
  // MessageScrollerProvider, is in AssistantPanel.tsx). What it pins is the
  // outcome a person needs on reopening — the approval waiting for them is
  // on screen.
  const viewport = panel.locator('[data-slot="message-scroller-viewport"]');
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThanOrEqual(2);
  await expect(panel.getByRole("button", { name: "Add task" })).toBeInViewport();
});
