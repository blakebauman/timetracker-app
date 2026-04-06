export class TimerRoomDO implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    _env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }
      const [client, server] = Object.values(new WebSocketPair()) as [
        WebSocket,
        WebSocket,
      ];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const { event, data } = (await request.json()) as {
        event: string;
        data: unknown;
      };
      const sessions = this.state.getWebSockets();
      const msg = JSON.stringify({ event, data, ts: Date.now() });
      for (const ws of sessions) {
        try {
          ws.send(msg);
        } catch {
          // Stale socket — hibernatable API handles cleanup
        }
      }
      return new Response(JSON.stringify({ sent: sessions.length }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(
    _ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    if (message === "ping") {
      _ws.send("pong");
    }
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    // Hibernatable WebSocket API handles cleanup automatically
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // Hibernatable WebSocket API handles cleanup automatically
  }
}
