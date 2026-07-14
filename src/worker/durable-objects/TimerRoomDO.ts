export class TimerRoomDO implements DurableObject {
  private sessions: Set<WebSocket> = new Set();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws" || url.pathname.endsWith("/api/ws")) {
      // Note: Upgrade header may be stripped by Cloudflare when forwarding to DO,
      // but the Hono route already validates it before forwarding here.
      const [client, server] = Object.values(new WebSocketPair()) as [
        WebSocket,
        WebSocket,
      ];
      server.accept();
      this.sessions.add(server);
      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));
      server.addEventListener("message", (event) => {
        if (event.data === "ping") {
          try {
            server.send("pong");
          } catch {
            this.sessions.delete(server);
          }
        }
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const { event, data } = (await request.json()) as {
        event: string;
        data: unknown;
      };
      const msg = JSON.stringify({ event, data, ts: Date.now() });
      let sent = 0;
      for (const ws of [...this.sessions]) {
        try {
          ws.send(msg);
          sent++;
        } catch {
          this.sessions.delete(ws);
        }
      }
      return new Response(JSON.stringify({ sent }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}
