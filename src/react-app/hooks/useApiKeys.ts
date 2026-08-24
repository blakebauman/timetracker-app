import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ApiKey, ApiKeyScope } from "@shared/schemas";

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
    onError: () => toast.error("Couldn't create the key"),
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
    onError: () => toast.error("Couldn't revoke the key"),
  });
}
