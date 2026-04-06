import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getPendingMutations,
  deletePendingMutation,
} from "@/lib/idb";

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const isDraining = useRef(false);

  useEffect(() => {
    if (!isOnline || isDraining.current) return;
    isDraining.current = true;

    drainQueue()
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      })
      .finally(() => {
        isDraining.current = false;
      });
  }, [isOnline, queryClient]);

  return { isOnline };
}

async function drainQueue() {
  const mutations = await getPendingMutations();
  for (const mutation of mutations) {
    try {
      const res = await fetch(mutation.url, {
        method: mutation.method,
        body: mutation.body ? JSON.stringify(mutation.body) : undefined,
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok && mutation.id !== undefined) {
        await deletePendingMutation(mutation.id);
      }
    } catch {
      // Still offline — stop trying
      break;
    }
  }
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      queryClient.invalidateQueries();
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
