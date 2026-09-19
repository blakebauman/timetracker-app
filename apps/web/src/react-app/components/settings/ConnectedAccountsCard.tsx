import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { authClient } from "@/lib/auth-client";
import { mutationErrorMessage } from "@/lib/api";

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
  const [unlinking, setUnlinking] = useState<{ account: AccountRow; label: string } | null>(
    null
  );

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
    // Better Auth's error is a plain object, never an ApiError, so this always
    // lands on the curated line — the server's wording never reaches the toast.
    onError: (e) => toast.error(mutationErrorMessage(e, "Couldn't start connecting that account")),
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
    onError: (e) => toast.error(mutationErrorMessage(e, "Couldn't disconnect that account")),
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
              <SettingsRow
                key={p.id}
                label={
                  <>
                    <span className="truncate">{p.label}</span>
                    {linked && (
                      <Badge variant="secondary" className="text-micro">
                        Connected
                      </Badge>
                    )}
                  </>
                }
                trailing={
                  linked ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setUnlinking({ account: linked, label: p.label })}
                      disabled={unlink.isPending || loginMethodCount <= 1}
                      title={
                        loginMethodCount <= 1
                          ? "Add another sign-in method before disconnecting this one"
                          : undefined
                      }
                    >
                      {unlink.isPending ? <Spinner size="sm" /> : "Disconnect"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => link.mutate(p.id)}
                      disabled={link.isPending}
                    >
                      {link.isPending ? <Spinner size="sm" /> : "Connect"}
                    </Button>
                  )
                }
              />
            );
          })
        )}
      </CardContent>

      <ConfirmDialog
        open={unlinking !== null}
        onOpenChange={(open) => !open && setUnlinking(null)}
        title={`Disconnect ${unlinking?.label ?? "this account"}?`}
        description="You won't be able to sign in with it until you connect it again. Your tracked time isn't affected."
        confirmLabel="Disconnect"
        onConfirm={() => {
          if (unlinking) unlink.mutate(unlinking.account);
          setUnlinking(null);
        }}
      />
    </Card>
  );
}
