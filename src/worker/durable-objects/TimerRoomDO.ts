import { DurableObject } from "cloudflare:workers";

export class TimerRoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answer the client's "ping" without waking a hibernated object.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws" || url.pathname.endsWith("/api/ws")) {
      // Note: Upgrade header may be stripped by Cloudflare when forwarding to DO,
      // but the Hono route already validates it before forwarding here.
      const [client, server] = Object.values(new WebSocketPair()) as [
        WebSocket,
        WebSocket,
      ];
      // Hibernation API: the runtime tracks the socket and can evict this
      // object between events instead of pinning it in memory (and billing
      // duration) for the lifetime of every open tab, as server.accept() did.
      this.ctx.acceptWebSocket(server);
      // Attachment survives hibernation; scopes activity relay to one user
      // within the workspace room.
      const userId = request.headers.get("X-User-Id");
      if (userId) server.serializeAttachment({ userId });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const { event, data } = (await request.json()) as {
        event: string;
        data: unknown;
      };
      const msg = JSON.stringify({ event, data, ts: Date.now() });
      let sent = 0;
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(msg);
          sent++;
        } catch {
          // Dead socket — the runtime reaps it; nothing to clean up here.
        }
      }
      return new Response(JSON.stringify({ sent }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // "ping" is handled by the auto-response pair. The only client-sent
    // message is an activity heartbeat, relayed to the same user's OTHER
    // sockets so idle detection on their open sessions defers to it.
    if (typeof message !== "string") return;
    let parsed: { type?: string };
    try {
      parsed = JSON.parse(message) as { type?: string };
    } catch {
      return;
    }
    if (parsed?.type !== "activity") return;

    const userId = (ws.deserializeAttachment() as { userId?: string } | null)
      ?.userId;
    if (!userId) return;

    const msg = JSON.stringify({ event: "user_activity", data: { userId }, ts: Date.now() });
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === ws) continue;
      const att = peer.deserializeAttachment() as { userId?: string } | null;
      if (att?.userId !== userId) continue;
      try {
        peer.send(msg);
      } catch {
        // Dead socket — the runtime reaps it.
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    // Compat date < 2026-04-07: we must complete the close handshake ourselves
    // or the client sees a 1006 abnormal closure.
    try {
      ws.close(code, reason);
    } catch {
      // Already closed, or a code (e.g. 1005) that close() rejects.
    }
  }

  webSocketError(ws: WebSocket): void {
    try {
      ws.close(1011, "error");
    } catch {
      // Already closed.
    }
  }
}
