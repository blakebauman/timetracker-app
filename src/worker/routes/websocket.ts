import { Hono } from "hono";

export const websocketRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
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
    return await stub.fetch(
      new Request("http://do/ws", {
        headers: c.req.raw.headers,
      })
    );
  } catch {
    return c.text("WebSocket unavailable", 503);
  }
});
