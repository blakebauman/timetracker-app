import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CLIENT_ID } from "@/lib/api";
import { adoptReplayedTimer } from "@/hooks/useTimer";
import {
  countPendingMutations,
  deletePendingMutation,
  getPendingMutations,
  onPendingMutationsChange,
} from "@/lib/idb";

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const pendingCount = usePendingMutationCount();
  const isDraining = useRef(false);

  useEffect(() => {
    if (!isOnline || isDraining.current) return;
    isDraining.current = true;

    drainQueue()
      .then((replayed) => {
        // Replayed writes can touch any surface — a task, a plan cell, a
        // project — so once something has actually landed, everything cached
        // is suspect. An empty drain (every mount, every flap with nothing
        // queued) keeps the narrow invalidate: `useOnlineStatus` already
        // refreshes the data that drifts while offline.
        if (replayed > 0) {
          queryClient.invalidateQueries();
          // A timer started offline has just been created for real; give the
          // bar its server id so the next edit or Stop goes straight to it.
          void adoptReplayedTimer();
        }
        else queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      })
      .finally(() => {
        isDraining.current = false;
      });
  }, [isOnline, queryClient]);

  return { isOnline, pendingCount };
}

/**
 * Replay the queued writes in the order they were made. Returns how many
 * reached the server.
 *
 * A 4xx is the server's verdict on the request itself — validation, a row
 * deleted in the meantime, a stale id — and no number of retries changes it,
 * so the entry is dropped rather than left to fail on every reconnect for the
 * rest of time. A 5xx or a network failure is about the moment, not the
 * request: stop and keep the rest of the queue in order for the next drain,
 * since replaying a later edit ahead of the earlier write it depends on is
 * worse than waiting.
 */
async function drainQueue(): Promise<number> {
  const mutations = await getPendingMutations();
  let replayed = 0;
  for (const mutation of mutations) {
    let res: Response;
    try {
      res = await fetch(mutation.url, {
        method: mutation.method,
        credentials: "include",
        body: mutation.body ? JSON.stringify(mutation.body) : undefined,
        // Same id `lib/api.ts` sends, so this tab still ignores the socket
        // echo of its own replayed change (see `useWebSocket`).
        headers: { "Content-Type": "application/json", "X-Client-Id": CLIENT_ID },
      });
    } catch {
      // Still offline — stop trying
      break;
    }
    if (res.ok) replayed += 1;
    if (mutation.id === undefined) continue;
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      await deletePendingMutation(mutation.id);
    } else {
      break;
    }
  }
  return replayed;
}

/**
 * How many writes are waiting for a connection — what the offline banner
 * counts. Re-counted whenever the queue changes (`lib/idb.ts` notifies on add
 * and delete) and on every online/offline transition, since a flap can drain
 * the queue from a hook that isn't this one.
 */
export function usePendingMutationCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    countPendingMutations()
      .then(setCount)
      .catch(() => {
        // IndexedDB unavailable (private window, storage blocked) — the queue
        // can't hold anything, so zero is the truth.
        setCount(0);
      });
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = onPendingMutationsChange(refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [refresh]);

  return count;
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Only the data that can drift while offline — a keyless invalidate here
      // refetched every cached query on each network flap.
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["assistant-nudges"] });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [queryClient]);

  return isOnline;
}
