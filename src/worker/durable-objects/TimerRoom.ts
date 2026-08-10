import { DurableObject } from "cloudflare:workers";

export class TimerRoom extends DurableObject<Env> {
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
      const { event, data, origin } = (await request.json()) as {
        event: string;
        data: unknown;
        origin?: string | null;
      };
      // `origin` rides along so the client that caused the change can skip its
      // own echo; the room still fans out to everyone, including that client,
      // because it may care about the payload even when it ignores the refetch.
      const msg = JSON.stringify({ event, data, origin: origin ?? null, ts: Date.now() });
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
    // Keep completing the handshake by hand, despite `web_socket_auto_reply_to_close`
    // being default-on from compat date 2026-04-07 (see wrangler.jsonc).
    //
    // #88 removed this on the strength of the docs and a local test. Measured
    // against production afterwards, a client-initiated close came back
    // `1006 / wasClean: false` — an abnormal closure, i.e. nothing reciprocated
    // the Close frame. Restoring this returns it to a clean 1000.
    //
    // The local runtime reciprocates regardless of compat date, so neither the
    // e2e suite nor CI can see the difference; only a probe against the deployed
    // worker can. Do not remove this again without re-measuring on production —
    // and note the docs say the call is harmless when auto-reply *is* active
    // (silently ignored once the socket is closed), so keeping it costs nothing
    // if the platform behaviour later matches the documentation.
    try {
      ws.close(code, reason);
    } catch {
      // Already closed, or a code (e.g. 1005) that close() rejects.
    }
  }

  webSocketError(ws: WebSocket): void {
    // Still needed: auto-reply covers Close frames, not the error path.
    try {
      ws.close(1011, "error");
    } catch {
      // Already closed.
    }
  }
}
