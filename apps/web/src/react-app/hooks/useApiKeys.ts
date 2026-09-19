import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, isQueuedOffline, mutationErrorMessage } from "@/lib/api";
import type { ApiKey, ApiKeyScope } from "@timetracker/core/schemas";

export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.apiKeys.list() as Promise<ApiKey[]>,
    staleTime: 60_000,
  });
}

/**
 * Mint a key. The plaintext comes back exactly once — the caller must show it
 * immediately, because nothing (including this app) can recover it afterwards.
 */
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; scope: ApiKeyScope }) => api.apiKeys.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
    // The secret is only ever in the create response, and a queued replay's
    // response goes nowhere — so a key minted by the drain is unusable.
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info(
            "Offline — the key will be created when you reconnect, but its secret can't be shown; revoke it then and create another"
          )
        : toast.error(mutationErrorMessage(err, "Couldn't create the key")),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.apiKeys.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key revoked");
    },
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info("Offline — the key will be revoked when you reconnect")
        : toast.error(mutationErrorMessage(err, "Couldn't revoke the key")),
  });
}
