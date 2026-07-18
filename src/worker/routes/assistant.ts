import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { AssistantChatRequestSchema, type AssistantChatResult } from "@shared/schemas";
import { computeNudges, buildAssistantContext } from "../lib/assistant";
import { runAssistantChat, AiParseError } from "../lib/ai";

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
