import { authClient } from "@/lib/auth-client";

export function useAuth() {
  const { data: session, isPending } = authClient.useSession();
  return {
    user: session?.user ?? null,
    session: session?.session ?? null,
    isLoading: isPending,
    signIn: authClient.signIn.email,
    signUp: authClient.signUp.email,
    signOut: () => authClient.signOut(),
  };
}
