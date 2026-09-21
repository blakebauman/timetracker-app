import { zValidator as base } from "@hono/zod-validator";
import type { Context } from "hono";

// Every route validates with this instead of @hono/zod-validator directly.
// The library's default 400 serializes the entire ZodError back to the caller
// — issue codes, the *received values*, and nested JSON strings the client
// then has to un-nest (lib/api.ts grew a helper for exactly that). Reply with
// what a caller can act on: the first message as `error`, plus each issue's
// path and message. Nothing the caller sent is echoed back.
const MAX_ISSUES = 10;

type Issue = { path: PropertyKey[]; message: string };

function reject(result: { success: boolean; error?: { issues?: Issue[] } }, c: Context) {
  if (result.success) return;
  const issues = (result.error?.issues ?? []).slice(0, MAX_ISSUES).map((i) => ({
    path: i.path.map(String),
    message: i.message,
  }));
  return c.json({ error: issues[0]?.message ?? "Invalid request", issues }, 400);
}

type Args = Parameters<typeof base>;

// Typed as the library's own generic signature so `c.req.valid()` keeps its
// inferred shape at every call site; the implementation only supplies the hook.
export const zValidator = ((target: Args[0], schema: Args[1], hook?: Args[2], options?: Args[3]) =>
  base(target, schema, (hook ?? reject) as never, options)) as typeof base;
