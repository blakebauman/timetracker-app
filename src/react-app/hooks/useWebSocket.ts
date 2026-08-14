import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTimerStore } from "@/stores/timerStore";
import { ACTIVITY_EVENTS, recordRemoteActivity } from "@/lib/activitySync";
import { invalidateEntryDerived } from "@/hooks/useEntries";
import { CLIENT_ID, api } from "@/lib/api";
import { clearTimerState } from "@/lib/idb";
import type { TimeEntry } from "@shared/schemas";

// Local activity is relayed to the user's other sessions (for idle detection)
// at most once per this interval, and only while a timer is running.
const ACTIVITY_HEARTBEAT_MS = 30_000;

// Keepalive. The room installs a "ping"/"pong" auto-response pair, which the
// runtime answers without waking the hibernated object — but nothing ever sent
// the "ping", so idle sockets could be reaped by an intermediary with no close
// event to trigger the backoff reconnect below.
const PING_INTERVAL_MS = 30_000;

interface WSMessage {
  event: string;
  data: unknown;
  /** The tab whose request caused this, or null for server-originated changes. */
  origin?: string | null;
  ts: number;
}

/**
 * `entries:changed` carries one of three shapes: the changed entry, `null`
 * (deletes and bulk operations), or `{ source }` from a server-originated
 * sweep (cron autotrack, recurring, the assistant, integrations). Only the
 * first is an entry — the others were being cast to `TimeEntry` regardless,
 * which happened to be harmless only because `running.id` is never undefined.
 */
function asEntry(data: unknown): TimeEntry | null {
  return data && typeof data === "object" && "id" in data
    ? (data as TimeEntry)
    : null;
}

export function useWebSocket() {
  const queryClient = useQueryClient();
  const { setFromWS } = useTimerStore();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    let destroyed = false;
    let hasConnected = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Re-sync after a gap in the socket.
     *
     * Every event broadcast while we were disconnected — laptop asleep, network
     * blip, the object evicted, or a `broadcast()` that threw and was swallowed
     * server-side — is gone for good; the room has no replay. `refetchOnWindowFocus`
     * eventually repairs the queries, but nothing repaired the running timer,
     * so a tab could sit indefinitely showing a timer that had stopped elsewhere.
     */
    async function resync() {
      invalidateEntryDerived(queryClient);
      try {
        const current = (await api.timeEntries.current()) as TimeEntry | null;
        if (destroyed) return;
        reconcileRunning(current);
      } catch {
        // Offline or the request raced a teardown — the next focus refetch or
        // reconnect tries again. Never leave the socket unusable over this.
      }
    }

    function connect() {
      if (destroyed) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/ws`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount.current = 0;
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, PING_INTERVAL_MS);
        // Only on a *re*connect: the first open is already covered by the
        // mount-time restore in `useTimerLifecycle`.
        if (hasConnected) void resync();
        hasConnected = true;
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
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
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

    /**
     * Tell the extension's content script immediately, instead of letting it
     * discover the change on its 30 s poll. Previously only the `timer:start`
     * and `timer:stop` branches did this, so discarding a timer or trimming
     * idle time — both of which arrive as `entries:changed` — left a red
     * running badge on the toolbar for up to half a minute.
     */
    function announceToExtension(entry: TimeEntry | null) {
      window.dispatchEvent(
        new CustomEvent("timetracker:sync", {
          detail: entry
            ? {
                running: true,
                entryId: entry.id,
                startedAt: entry.start,
                description: entry.description,
                projectId: entry.projectId ?? null,
              }
            : { running: false },
        })
      );
    }

    /**
     * Apply a view of "what is running" to the store, the badge and IDB.
     *
     * `setFromWS` decides what counts as running — including treating an entry
     * that now has a `stop` as a clear — so read the store back rather than
     * assuming the argument survived as-is.
     */
    function reconcileRunning(entry: TimeEntry | null) {
      const before = useTimerStore.getState().runningEntry;
      setFromWS(entry);
      const after = useTimerStore.getState().runningEntry;
      if (!after && before) void clearTimerState();
      // Announce on content changes too, not just id changes: the badge shows
      // the description, so a rename in another tab has to reach it.
      if (before?.id !== after?.id || before?.description !== after?.description) {
        announceToExtension(after);
      }
    }

    function handleMessage(msg: WSMessage) {
      // A change this tab made is already reflected — optimistically, then from
      // the mutation's own response and invalidate. Refetching again because the
      // socket reported our own write doubled the request count on every edit
      // and could land a refetch on top of an unrelated field mid-typing.
      // State merges below still run: they're idempotent and cheap.
      const isOwnEcho = !!msg.origin && msg.origin === CLIENT_ID;
      const invalidateEntries = () => {
        if (isOwnEcho) return;
        invalidateEntryDerived(queryClient);
      };

      switch (msg.event) {
        case "timer:start": {
          const entry = asEntry(msg.data);
          if (entry) {
            setFromWS(entry);
            // Notify extension content script for instant badge update (no poll lag)
            announceToExtension(entry);
          }
          // Also refresh entries list — starting a timer auto-stops the previous one
          invalidateEntries();
          break;
        }
        case "timer:stop": {
          const stoppedEntry = asEntry(msg.data);
          const currentRunning = useTimerStore.getState().runningEntry;
          // Only clear if the stopped entry is actually the one we're tracking.
          // Guards against a stale extension entryId stopping an already-stopped
          // entry and falsely clearing a different, still-running timer.
          if (!currentRunning || !stoppedEntry || currentRunning.id === stoppedEntry.id) {
            setFromWS(null);
            void clearTimerState();
            // Notify extension content script for instant badge update (no poll
            // lag). Outside the id guard would be wrong — a mismatched id means
            // some *other* entry stopped, and our timer is still running.
            announceToExtension(null);
          }
          invalidateEntries();
          break;
        }
        case "user_activity": {
          // Another session of THIS user was active (TimerRoom only relays
          // to same-user sockets). Stamp with our own clock — see activitySync.
          recordRemoteActivity();
          break;
        }
        case "entries:changed": {
          // If another tab edited the entry we're currently tracking (e.g.
          // reassigned its project), fold the change into the running timer so
          // the bar/sidebar stay in sync. Merges same-id without resetting
          // elapsed — and clears it outright when the edit set a `stop`, which
          // is how trimming idle time and the edit sheet close a timer.
          const changed = asEntry(msg.data);
          const running = useTimerStore.getState().runningEntry;
          if (changed) {
            if (running && changed.id === running.id) reconcileRunning(changed);
          } else if (running) {
            // No entry in the payload: a delete (including a discard from
            // another tab) or a bulk operation. Either may have removed the
            // very entry we're counting, and the payload can't tell us — so ask
            // the server. Ignoring this left tabs ticking a deleted entry until
            // reload.
            void resync();
          }
          invalidateEntries();
          break;
        }
      }
    }

    connect();

    // Heartbeat out: on local input, tell the user's other sessions we're
    // active so their idle detection defers to us. Activity-driven (never a
    // blind interval — an untouched tab must NOT look active) and throttled
    // so DO wake-ups stay negligible.
    let lastSent = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastSent < ACTIVITY_HEARTBEAT_MS) return;
      if (!useTimerStore.getState().runningEntry) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      lastSent = now;
      ws.send(JSON.stringify({ type: "activity" }));
    };
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    );

    return () => {
      destroyed = true;
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      if (retryRef.current) clearTimeout(retryRef.current);
      if (pingTimer) clearInterval(pingTimer);
      wsRef.current?.close();
    };
  }, [queryClient, setFromWS]);
}
