import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ClientStats } from "@shared/schemas";

/**
 * Per-client totals for a window, keyed by client id.
 *
 * Returned as a Map so the list can join it onto the clients query by id
 * without an O(n²) find per row — a workspace with a long client list renders
 * one row per client and would otherwise re-scan the whole array each time.
 */
export function useClientStats(since: string, until: string) {
  const query = useQuery({
    queryKey: ["client-stats", since, until],
    queryFn: () => api.clients.stats({ since, until }) as Promise<ClientStats[]>,
    staleTime: 30_000,
  });

  const byClient = new Map<string, ClientStats>(
    (query.data ?? []).map((s) => [s.clientId, s])
  );

  return { ...query, byClient };
}
