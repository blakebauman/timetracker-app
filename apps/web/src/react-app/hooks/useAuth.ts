import { sessionClient } from "@/lib/auth-session";
// Type-only, so erased from the build: the plugins stay out of the first load.
import type { authClient } from "@/lib/auth-client";
import { clearOfflineState } from "@/lib/idb";
import { useAssistantStore } from "@/stores/assistantStore";

/**
 * Sign out, then forget what this browser kept about the account: the
 * IndexedDB timer snapshot and offline write queue (entry descriptions,
 * project ids, queued request bodies) and the Assistant's persisted nudge
 * state (its ids encode calendar facts). Device preferences (`pref_*`,
 * theme) stay — they describe the machine, not the person. Nothing here is
 * a credential; the session itself is a cookie Better Auth clears.
 */
async function signOutAndForget(): Promise<void> {
  await sessionClient.signOut();
  await clearOfflineState();
  try {
    useAssistantStore.persist.clearStorage();
    localStorage.removeItem("time-tracker-assistant");
  } catch {
    // Storage unavailable (private mode, quota) — nothing to clear.
  }
}

export function useAuth() {
  // The server sends the same session to both clients, plugin fields (the
  // admin plugin's `role`, …) included; only the plugin-free client's *type*
  // doesn't know them. Typed from the full client.
  const { data, isPending } = sessionClient.useSession();
  const session = data as typeof authClient.$Infer.Session | null;
  return {
    user: session?.user ?? null,
    session: session?.session ?? null,
    isLoading: isPending,
    signOut: signOutAndForget,
  };
}
