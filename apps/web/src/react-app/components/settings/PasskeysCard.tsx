import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { authClient } from "@/lib/auth-client";
import { mutationErrorMessage } from "@/lib/api";
import { formatShortDate } from "@/lib/dateUtils";

function toIso(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}

export function PasskeysCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const { data: passkeys = [], isLoading } = useQuery({
    queryKey: ["auth", "passkeys"],
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) throw new Error(error.message ?? "Failed to load passkeys");
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      // Triggers the browser's WebAuthn prompt. Returns undefined on user cancel.
      const res = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
      if (res?.error) throw new Error(res.error.message ?? "Failed to add passkey");
    },
    onSuccess: () => {
      toast.success("Passkey added");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });
    },
    // Better Auth's error is a plain object, never an ApiError, so this always
    // lands on the curated line — the server's wording never reaches the toast.
    onError: (e) => toast.error(mutationErrorMessage(e, "Couldn't add that passkey")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) throw new Error(error.message ?? "Failed to remove passkey");
    },
    onSuccess: () => {
      toast.success("Passkey removed");
      queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });
    },
    onError: (e) => toast.error(mutationErrorMessage(e, "Couldn't remove that passkey")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Passkeys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-normal text-muted-foreground">
          Sign in with Touch ID, Windows Hello, or a security key — no password needed.
        </p>

        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : passkeys.length > 0 ? (
          <div className="space-y-2">
            {passkeys.map((p) => {
              const label = p.name || "Passkey";
              // Only the row being removed shows it working; the mutation is
              // shared, so `variables` says which row that is.
              const isRemoving = remove.isPending && remove.variables === p.id;
              return (
                <SettingsRow
                  key={p.id}
                  icon={KeyRound}
                  label={label}
                  description={p.createdAt && `Added ${formatShortDate(toIso(p.createdAt))}`}
                  trailing={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove passkey ${label}`}
                      title="Remove passkey"
                      onClick={() => setRemoving({ id: p.id, name: label })}
                      disabled={isRemoving}
                    >
                      {isRemoving ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  }
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={KeyRound}
            title="No passkeys yet"
            description="Add one below and the next sign-in is a fingerprint, not a code."
            as="h3"
            className="rounded-container border border-dashed py-6"
          />
        )}

        <div className="flex items-center gap-2 pt-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            // Guarded: Enter while the WebAuthn prompt is up would open a
            // second one on top of the first.
            onKeyDown={(e) => e.key === "Enter" && !add.isPending && add.mutate()}
            placeholder="Passkey name (e.g. MacBook)"
            aria-label="Passkey name"
            className="h-8 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => add.mutate()}
            disabled={add.isPending}
          >
            {add.isPending ? <Spinner size="sm" /> : <KeyRound className="h-3.5 w-3.5" />}
            Add passkey
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove passkey ${removing?.name ?? ""}?`}
        description="You won't be able to sign in with it any more. Other passkeys and sign-in methods aren't affected."
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
          setRemoving(null);
        }}
      />
    </Card>
  );
}
