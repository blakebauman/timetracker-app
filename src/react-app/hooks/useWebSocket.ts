import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTimerStore } from "@/stores/timerStore";
import type { TimeEntry } from "@shared/schemas";

interface WSMessage {
  event: string;
  data: unknown;
  ts: number;
}

export function useWebSocket() {
  const queryClient = useQueryClient();
  const { setFromWS } = useTimerStore();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    let destroyed = false;

    function connect() {
      if (destroyed) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/ws`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WSMessage;
          handleMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (destroyed) return;
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30_000);
        retryCount.current++;
        retryRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function handleMessage(msg: WSMessage) {
      switch (msg.event) {
        case "timer:start":
          setFromWS(msg.data as TimeEntry);
          queryClient.invalidateQueries({ queryKey: ["timer-current"] });
          break;
        case "timer:stop":
          setFromWS(null);
          queryClient.invalidateQueries({ queryKey: ["timer-current"] });
          queryClient.invalidateQueries({ queryKey: ["time-entries"] });
          break;
        case "entries:changed":
          queryClient.invalidateQueries({ queryKey: ["time-entries"] });
          break;
      }
    }

    connect();

    return () => {
      destroyed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [queryClient, setFromWS]);
}
