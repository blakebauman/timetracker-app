import { Hono } from "hono";

export const websocketRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>().get("/", async (c) => {
  const workspaceId = c.get("workspaceId");

  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }

  // Route to the TimerRoom Durable Object for this workspace
  try {
    const id = c.env.TIMER_ROOM.idFromName(workspaceId);
    const stub = c.env.TIMER_ROOM.get(id);
    // Clone so we can tag the authenticated user for the DO (the room is
    // per-workspace; activity relay is scoped per-user via this header).
    const forwarded = new Request(c.req.raw);
    forwarded.headers.set("X-User-Id", c.get("userId"));
    return await stub.fetch(forwarded);
  } catch (e) {
    console.error("timer ws upgrade failed", { workspaceId, error: String(e) });
    return c.text("WebSocket unavailable", 503);
  }
});
