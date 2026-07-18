// Aski's chat brain: one AIChatAgent (Durable Object) per workspace. Persists
// the conversation + resumable streams in its own SQLite, and on each turn runs
// a Workers AI (Llama) streamText loop with the assistant tools bound. The DO's
// instance name IS the workspace id — the worker rewrites /agents/* routing so a
// client can only ever reach its own workspace's agent (see worker/index.ts).

import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { streamText, convertToModelMessages, stepCountIs, type StreamTextOnFinishCallback, type ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { buildAssistantContext } from "../lib/assistant";
import { buildAssistantTools } from "../lib/assistant-tools";
import { recallMemories, buildMemoryBlock } from "../lib/assistant-memory";

// Same model the app already uses for structured AI (JSON mode + function
// calling). Llama 4 Scout supports tool calling, which is what Aski needs.
const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

// Typed against Cloudflare.Env (the SDK's generic constraint). Our app-level
// `Env` marks a few secrets optional, which isn't assignable to that constraint;
// Cloudflare.Env is a structural superset our Env-typed helpers still accept.
export class ChatAgent extends AIChatAgent<Cloudflare.Env> {
  // Bound so a long-lived workspace agent doesn't grow unbounded in SQLite.
  maxPersistedMessages = 100;

  async onChatMessage(onFinish: StreamTextOnFinishCallback<ToolSet>, options?: OnChatMessageOptions) {
    const workspaceId = this.name;
    // Client sends its getTimezoneOffset() per request so grounded times read in
    // the user's local zone; 0 (UTC) if absent.
    const rawOffset = Number(options?.body?.timezoneOffsetMinutes);
    const offset = Number.isFinite(rawOffset) ? Math.max(-14 * 60, Math.min(14 * 60, rawOffset)) : 0;

    const [context, memories] = await Promise.all([
      buildAssistantContext(this.env, workspaceId, offset),
      recallMemories(this.env.DB, workspaceId),
    ]);
    const memoryBlock = buildMemoryBlock(memories);

    const system = `You are Aski, the built-in assistant of a time-tracking app used by consultants who bill clients for their hours. You help the user keep an accurate timesheet: surface untracked meetings, answer questions about tracked time, and — when asked — take actions via your tools (start/stop the timer, log entries, track meetings, delete an entry).

Rules:
- Ground factual answers in the CURRENT FACTS below and tool results. Never invent entries, meetings, or numbers.
- Prefer taking the action with a tool over telling the user to do it themselves. Confirm briefly what you did.
- When matching work to a project, use the exact known project names. If unsure which project, log without one rather than guessing.
- Deleting an entry is destructive and will ask the user to approve — only call it when they clearly identify the entry.
- When the user states a durable preference ("always mark Acme non-billable", "my day starts at 9"), save it with rememberPreference.
- Be concise and friendly — a sentence or two, plain text, no markdown headings. Times shown are the user's local time.
${memoryBlock ? `\nKnown preferences about this user:\n${memoryBlock}\n` : ""}
CURRENT FACTS:
${context}`;

    const workersai = createWorkersAI({ binding: this.env.AI });
    const tools = buildAssistantTools({ env: this.env, workspaceId, offsetMinutes: offset });

    const result = streamText({
      model: workersai(MODEL),
      system,
      messages: await convertToModelMessages(this.messages),
      tools,
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal,
      onFinish,
    });

    return result.toUIMessageStreamResponse();
  }
}
