import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  AssistantChatRequestSchema,
  AssistantTrackEventRequestSchema,
  type AssistantChatResult,
  type AssistantTrackEventResult,
} from "@shared/schemas";
import { computeNudges, buildAssistantContext } from "../lib/assistant";
import { runAssistantChat, inferEventProjects, AiParseError } from "../lib/ai";
import { broadcast } from "../db/queries";

// Clamp to sane UTC offsets so a bad client can't shift day-bound queries
// arbitrarily far. Same JS getTimezoneOffset() convention as the AI routes.
const NudgesQuerySchema = z.object({
  timezoneOffsetMinutes: z.coerce.number().min(-14 * 60).max(14 * 60).default(0),
});

export const assistantRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  // Deterministic, cheap to poll — no AI involved.
  .get("/nudges", zValidator("query", NudgesQuerySchema), async (c) => {
    const { timezoneOffsetMinutes } = c.req.valid("query");
    const nudges = await computeNudges(c.env, c.get("workspaceId"), timezoneOffsetMinutes);
    return c.json(nudges);
  })
  // One-click "Add to timesheet" from an untracked-meeting nudge. Server-side
  // so the entry can be pre-categorized via grounded AI project inference —
  // inference failure still creates the entry, just without a project.
  .post("/track-event", zValidator("json", AssistantTrackEventRequestSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { calendarEventId, title, start, stop } = c.req.valid("json");

    // Idempotent: the nudge may race auto-track or a double-click.
    const existing = await c.env.DB.prepare(
      `SELECT id FROM time_entries WHERE workspace_id = ? AND calendar_event_id = ? LIMIT 1`
    )
      .bind(workspaceId, calendarEventId)
      .first<{ id: string }>();
    if (existing) {
      return c.json({
        created: false,
        projectId: null,
        projectName: null,
        billable: false,
      } satisfies AssistantTrackEventResult);
    }

    let match = null;
    try {
      match =
        (await inferEventProjects(c.env.DB, c.env.AI, workspaceId, [title])).get(title.trim()) ??
        null;
    } catch {
      // Best-effort only.
    }

    const now = new Date().toISOString();
    const duration = Math.round(
      (new Date(stop).getTime() - new Date(start).getTime()) / 1000
    );
    await c.env.DB.prepare(
      `INSERT INTO time_entries
         (id, workspace_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        workspaceId,
        match?.projectId ?? null,
        title,
        start,
        stop,
        duration,
        match?.billable ? 1 : 0,
        calendarEventId,
        now,
        now
      )
      .run();
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "entries:changed", { source: "assistant" })
    );

    return c.json({
      created: true,
      projectId: match?.projectId ?? null,
      projectName: match?.projectName ?? null,
      billable: Boolean(match?.billable),
    } satisfies AssistantTrackEventResult);
  })
  .post("/chat", zValidator("json", AssistantChatRequestSchema), async (c) => {
    const { messages, timezoneOffsetMinutes } = c.req.valid("json");
    const offset = Math.max(-14 * 60, Math.min(14 * 60, timezoneOffsetMinutes));

    const context = await buildAssistantContext(c.env, c.get("workspaceId"), offset);

    try {
      // Keep only the conversation tail — the grounding context carries the state.
      const reply = await runAssistantChat(c.env.AI, context, messages.slice(-12));
      return c.json({ reply } satisfies AssistantChatResult);
    } catch (err) {
      const message = err instanceof AiParseError ? err.message : "AI is unavailable right now";
      return c.json({ error: message }, 502);
    }
  });
