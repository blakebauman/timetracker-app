import { QueryClient } from "@tanstack/react-query";
import { isQueuedOffline } from "@/lib/api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      // "always", not the default "online": offline writes are this app's own
      // job (lib/api.ts persists them to IndexedDB and useOfflineSync replays
      // them). Under "online", a mutation fired while the browser reported no
      // connection was *paused in memory* instead — it never reached that
      // queue, was lost with the tab, and none of the hooks' "Offline — will
      // sync" branches ever ran. A timer stopped offline stayed paused until
      // reconnect and was then stopped at reconnect time.
      networkMode: "always",
      // Never retry a write that was queued for replay: the retry would queue
      // it a second time, and the replay would then create the entry twice.
      retry: (failureCount, error) => !isQueuedOffline(error) && failureCount < 1,
    },
  },
});

// The families the realtime socket keeps fresh. Every change to them is
// broadcast to the workspace and invalidated on arrival (useWebSocket), and a
// reconnect resyncs them, so a refetch on every window focus after 30 s only
// re-reads what the socket already delivered — a tab switch cost 3–4 entry
// ranges plus the task and project lists. Focus still repairs them after
// 2 minutes, in case a socket dies quietly.
const SOCKET_FRESHENED_STALE_MS = 2 * 60_000;
for (const family of ["time-entries", "tasks", "projects"]) {
  queryClient.setQueryDefaults([family], { staleTime: SOCKET_FRESHENED_STALE_MS });
}
