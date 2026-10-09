import { test, expect } from "@playwright/test";
import { streamText, tool, jsonSchema } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { dedupedAI } from "../src/worker/lib/workers-ai-stream";

// Workers AI streams each Llama 4 Scout chunk in two formats at once — native
// `response`/`tool_calls` and OpenAI `choices[0].delta` — and the provider
// emitted both, doubling every token and every tool-call argument. These are
// the chunk shapes the API actually returned (trimmed of usage/ids), fed
// through the real provider and streamText.
const sse = (chunks: object[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      // Split mid-line on purpose: a network chunk boundary can land anywhere.
      const text = chunks.map((x) => `data: ${JSON.stringify(x)}\n\n`).join("") + "data: [DONE]\n\n";
      const mid = Math.floor(text.length / 2);
      c.enqueue(enc.encode(text.slice(0, mid)));
      c.enqueue(enc.encode(text.slice(mid)));
      c.close();
    },
  });

const textChunks = ["the", " quick", " brown", " fox"].map((t) => ({
  choices: [{ delta: { content: t }, finish_reason: null, index: 0 }],
  object: "chat.completion.chunk",
  response: t,
  tool_calls: [],
}));
const toolChunks = [
  { choices: [{ delta: { tool_calls: [{ function: { arguments: '{"city": "', name: "getWeather" }, id: "call_1", index: 0, type: "function" }] }, index: 0 }], tool_calls: [{ arguments: '{"city": "', name: "getWeather" }] },
  { choices: [{ delta: { tool_calls: [{ function: { arguments: "Paris" }, id: null, index: 0 }] }, index: 0 }], tool_calls: [{ arguments: "Paris" }] },
  { choices: [{ delta: { tool_calls: [{ function: { arguments: '"}' }, id: null, index: 0 }] }, index: 0 }], tool_calls: [{ arguments: '"}' }] },
  { choices: [{ delta: { content: "" }, finish_reason: "tool_calls", index: 0 }], response: "", tool_calls: [] },
  { choices: [], tool_calls: [] },
  { response: "" },
];

const binding = (chunks: object[]) => ({ run: async () => sse(chunks) }) as unknown as Ai;

test("streamed text arrives once, not twice", async () => {
  const model = createWorkersAI({ binding: dedupedAI(binding(textChunks)) })("@cf/meta/llama-4-scout-17b-16e-instruct");
  const result = streamText({ model, prompt: "hi" });
  expect(await result.text).toBe("the quick brown fox");
});

test("a streamed tool call's arguments parse and the tool runs", async () => {
  const model = createWorkersAI({ binding: dedupedAI(binding(toolChunks)) })("@cf/meta/llama-4-scout-17b-16e-instruct");
  let called: unknown = null;
  const result = streamText({
    model,
    prompt: "weather?",
    tools: {
      getWeather: tool({
        inputSchema: jsonSchema<{ city: string }>({ type: "object", properties: { city: { type: "string" } }, required: ["city"] }),
        execute: async (input) => {
          called = input;
          return { ok: true };
        },
      }),
    },
  });
  await result.consumeStream();
  expect(called).toEqual({ city: "Paris" });
});

test("without the wrapper the provider doubles both (guards the premise)", async () => {
  const model = createWorkersAI({ binding: binding(textChunks) })("@cf/meta/llama-4-scout-17b-16e-instruct");
  const text = await streamText({ model, prompt: "hi" }).text;
  // If a provider release fixes this upstream, this fails — and the wrapper can go.
  expect(text).toBe("thethe quick quick brown brown fox fox");
});
