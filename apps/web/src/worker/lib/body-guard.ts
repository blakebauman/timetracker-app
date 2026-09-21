/**
 * Request-size guards for the two paths that are answered before Hono
 * (/mcp and /agents/*) and therefore never see hono/body-limit.
 *
 * Content-Length is the cheap check and covers every real client. A chunked
 * body has no length up front, so the stream is also counted as it is read
 * and errored past the cap — the consumer then fails its read instead of
 * buffering an unbounded body into memory.
 */
const TOO_LARGE = () =>
  new Response(JSON.stringify({ error: "Payload too large" }), {
    status: 413,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** A ready 413 when the declared length exceeds the cap, else null. */
export function bodyTooLarge(request: Request, maxBytes: number): Response | null {
  const declared = Number(request.headers.get("content-length"));
  return Number.isFinite(declared) && declared > maxBytes ? TOO_LARGE() : null;
}

/** The same request with its body counted; reads past the cap error out. */
export function limitBody(request: Request, maxBytes: number): Request {
  if (!request.body) return request;
  let seen = 0;
  const counted = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBytes) controller.error(new Error("Payload too large"));
        else controller.enqueue(chunk);
      },
    }),
  );
  return new Request(request, { body: counted });
}
