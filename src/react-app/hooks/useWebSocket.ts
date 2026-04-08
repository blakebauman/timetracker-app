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
        case "timer:start": {
          const entry = msg.data as TimeEntry;
          setFromWS(entry);
          // Also refresh entries list — starting a timer auto-stops the previous one
          queryClient.invalidateQueries({ queryKey: ["time-entries"] });
          // Notify extension content script for instant badge update (no poll lag)
          window.dispatchEvent(new CustomEvent("timetracker:sync", {
            detail: { running: true, entryId: entry.id, startedAt: entry.start, description: entry.description, projectId: entry.projectId ?? null },
          }));
          break;
        }
        case "timer:stop": {
          const stoppedEntry = msg.data as TimeEntry | null;
          const currentRunning = useTimerStore.getState().runningEntry;
          // Only clear if the stopped entry is actually the one we're tracking.
          // Guards against a stale extension entryId stopping an already-stopped
          // entry and falsely clearing a different, still-running timer.
          if (!currentRunning || !stoppedEntry || currentRunning.id === stoppedEntry.id) {
            setFromWS(null);
            // Notify extension content script for instant badge update (no poll lag)
            window.dispatchEvent(new CustomEvent("timetracker:sync", { detail: { running: false } }));
          }
          queryClient.invalidateQueries({ queryKey: ["time-entries"] });
          break;
        }
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
