import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

interface AccountRow {
  id: string;
  providerId: string;
  accountId: string;
}

// Providers we let the user manage from the UI. "credential" (email/password)
// is intentionally excluded — it's managed via the password section.
const PROVIDERS = [{ id: "google", label: "Google" }] as const;

export function ConnectedAccountsCard() {
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["auth", "accounts"],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(error.message ?? "Failed to load accounts");
      return (data ?? []) as AccountRow[];
    },
  });

  const link = useMutation({
    mutationFn: async (provider: string) => {
      // Redirects to the provider and back to settings on success.
      const { error } = await authClient.linkSocial({
        provider: provider as "google",
        callbackURL: "/settings",
      });
      if (error) throw new Error(error.message ?? "Failed to start linking");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = useMutation({
    mutationFn: async (account: AccountRow) => {
      const { error } = await authClient.unlinkAccount({
        providerId: account.providerId,
        accountId: account.accountId,
      });
      if (error) throw new Error(error.message ?? "Failed to disconnect");
    },
    onSuccess: () => {
      toast.success("Account disconnected");
      queryClient.invalidateQueries({ queryKey: ["auth", "accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // A user with only one credential (their social login) can't unlink their last
  // sign-in method. Allow unlink only when another login method remains.
  const loginMethodCount = accounts.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connected accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          PROVIDERS.map((p) => {
            const linked = accounts.find((a) => a.providerId === p.id);
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.label}</span>
                  {linked && (
                    <Badge variant="secondary" className="text-micro">
                      Connected
                    </Badge>
                  )}
                </div>
                {linked ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => unlink.mutate(linked)}
                    disabled={unlink.isPending || loginMethodCount <= 1}
                    title={
                      loginMethodCount <= 1
                        ? "Add another sign-in method before disconnecting this one"
                        : undefined
                    }
                  >
                    {unlink.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disconnect"}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => link.mutate(p.id)}
                    disabled={link.isPending}
                  >
                    {link.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
