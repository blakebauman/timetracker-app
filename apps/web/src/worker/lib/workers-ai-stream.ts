// Workers AI streams each chunk of an OpenAI-compatible chat model (Llama 4
// Scout, the Assistant's model) in BOTH of its formats at once:
//
//   data: {"choices":[{"delta":{"content":" quick"}}], "response":" quick", "tool_calls":[], ...}
//   data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"Paris"},"index":0}]}}],
//          "tool_calls":[{"arguments":"Paris"}], ...}
//
// workers-ai-provider (3.3.1) reads the native `response` / `tool_calls` and
// then the `choices[0].delta`, and emits both — so every streamed token reached
// the chat twice ("thethe quick quick brown brown fox fox"), and every tool
// call's arguments were assembled twice into JSON that doesn't parse, so the
// Assistant's tools failed instead of running.
//
// The fix is at the binding, not in the provider: when a chunk carries
// `choices`, its native copies are dropped before the provider sees it, so it
// reads one format. Chunks without `choices` (older native-format models, the
// trailing `{"response":""}`) pass through untouched, as does every
// non-streaming call.

/** Rewrites one SSE `data:` payload; anything that isn't a JSON object with `choices` is returned as-is. */
export function dedupeChunk(data: string): string {
  if (!data || data === "[DONE]") return data;
  let chunk: unknown;
  try {
    chunk = JSON.parse(data);
  } catch {
    return data;
  }
  if (!chunk || typeof chunk !== "object" || !Array.isArray((chunk as { choices?: unknown }).choices)) {
    return data;
  }
  const rest = { ...(chunk as Record<string, unknown>) };
  delete rest.response;
  delete rest.tool_calls;
  return JSON.stringify(rest);
}

/** A TransformStream over raw SSE bytes that applies `dedupeChunk` to every `data:` line. */
export function dedupeSSE(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const rewrite = (line: string) =>
    line.startsWith("data:") ? `data: ${dedupeChunk(line.slice(5).trim())}` : line;
  return new TransformStream({
    transform(bytes, controller) {
      buffer += decoder.decode(bytes, { stream: true });
      // Only complete lines are rewritten; a chunk boundary can split one.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      if (lines.length) controller.enqueue(encoder.encode(lines.map(rewrite).join("\n") + "\n"));
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) controller.enqueue(encoder.encode(rewrite(buffer)));
    },
  });
}

/**
 * The AI binding with streamed chat responses de-duplicated. Every other
 * property and method is the binding's own.
 */
export function dedupedAI(binding: Ai): Ai {
  return new Proxy(binding, {
    get(target, prop, receiver) {
      if (prop !== "run") {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        const out = await (target.run as (...a: unknown[]) => Promise<unknown>)(...args);
        if (out instanceof ReadableStream) return out.pipeThrough(dedupeSSE());
        if (out instanceof Response && out.body) return new Response(out.body.pipeThrough(dedupeSSE()), out);
        return out;
      };
    },
  });
}
