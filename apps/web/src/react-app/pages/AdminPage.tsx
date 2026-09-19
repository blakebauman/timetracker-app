import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, Ban, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { api, mutationErrorMessage } from "@/lib/api";
import { CollectionHeader } from "@/components/layout/CollectionHeader";
import { Pane, PaneScroll } from "@/components/layout/Pane";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
};

const DEFAULT_BAN_REASON = "Violation of terms";

export function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Ban flow: which user the dialog is for, plus the editable reason.
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState(DEFAULT_BAN_REASON);
  const [banPending, setBanPending] = useState(false);
  // Remove flow: hard-deletes the user and purges their solo workspaces.
  const [removeTarget, setRemoveTarget] = useState<AdminUser | null>(null);
  // Impersonate signs the admin in as someone else and reloads the app — a
  // one-click ghost button next to Ban was too easy to hit by accident.
  const [impersonateTarget, setImpersonateTarget] = useState<AdminUser | null>(null);
  // Which row's unban / impersonate call is in flight, so the button it came
  // from can say so and can't be pressed twice.
  const [unbanPendingId, setUnbanPendingId] = useState<string | null>(null);
  const [impersonatePendingId, setImpersonatePendingId] = useState<string | null>(null);

  const {
    data: users = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data } = await authClient.admin.listUsers({ query: { limit: 100 } });
      return (data?.users as AdminUser[] | undefined) ?? [];
    },
    enabled: user?.role === "admin",
  });

  const refetchUsers = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

  if (!user) return null;
  if (user.role !== "admin") return <Navigate to="/" replace />;

  const openBanDialog = (target: AdminUser) => {
    setBanReason(DEFAULT_BAN_REASON);
    setBanTarget(target);
  };

  const handleBan = async () => {
    if (!banTarget || banPending) return;
    setBanPending(true);
    const { error } = await authClient.admin.banUser({
      userId: banTarget.id,
      banReason: banReason.trim() || DEFAULT_BAN_REASON,
    });
    setBanPending(false);
    if (error) {
      toast.error(mutationErrorMessage(error, "Failed to ban user"));
      return;
    }
    setBanTarget(null);
    toast.success("User banned");
    refetchUsers();
  };

  const handleUnban = async (userId: string) => {
    if (unbanPendingId) return;
    setUnbanPendingId(userId);
    const { error } = await authClient.admin.unbanUser({ userId });
    setUnbanPendingId(null);
    if (error) {
      toast.error(mutationErrorMessage(error, "Failed to unban user"));
      return;
    }
    toast.success("User unbanned");
    refetchUsers();
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    try {
      const { purgedWorkspaces } = await api.admin.removeUser(target.id);
      toast.success(
        purgedWorkspaces > 0
          ? `Removed ${target.email} and ${purgedWorkspaces} ${purgedWorkspaces === 1 ? "workspace" : "workspaces"}`
          : `Removed ${target.email}`
      );
      refetchUsers();
    } catch {
      toast.error("Failed to remove user");
    }
  };

  const handleImpersonate = async () => {
    if (!impersonateTarget || impersonatePendingId) return;
    const target = impersonateTarget;
    setImpersonateTarget(null);
    setImpersonatePendingId(target.id);
    const { error } = await authClient.admin.impersonateUser({ userId: target.id });
    if (error) {
      setImpersonatePendingId(null);
      toast.error(mutationErrorMessage(error, "Failed to impersonate user"));
      return;
    }
    // Stays pending on purpose: the page is about to reload as the other user.
    window.location.href = "/";
  };

  return (
    <Pane>
      <CollectionHeader title="Admin" subtitle="Manage every user" />

      <PaneScroll>
        <h2 className="mb-2 text-base font-semibold">Users</h2>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-container" />
            ))}
          </div>
        ) : isError ? (
          // A failed list must not read as "no users yet" — on an admin page
          // that would be a very confident lie.
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load users"
            description="The request didn't get through. Nothing has changed."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No users yet" description="Users will appear here once they sign up." />
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-container border bg-card px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium">{u.name}</span>
                  <span className="ml-2 text-muted-foreground">{u.email}</span>
                  {u.role === "admin" && <Badge className="ml-2" variant="secondary">Admin</Badge>}
                  {u.banned && <Badge className="ml-2" variant="destructive">Banned</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {u.banned ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUnban(u.id)}
                      disabled={unbanPendingId === u.id}
                    >
                      {unbanPendingId === u.id && <Spinner size="sm" />}
                      Unban
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => openBanDialog(u)}>
                      Ban
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setImpersonateTarget(u)}
                    disabled={impersonatePendingId === u.id}
                  >
                    {impersonatePendingId === u.id && <Spinner size="sm" />}
                    Impersonate
                  </Button>
                  {u.id !== user.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoveTarget(u)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PaneScroll>

      {/* Ban dialog — reason is editable, defaulting to the standard wording. */}
      <Dialog open={Boolean(banTarget)} onOpenChange={(o) => !o && setBanTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4" />
              Ban {banTarget?.name || "user"}?
            </DialogTitle>
            <DialogDescription>
              {banTarget?.email} won't be able to sign in until unbanned. Their data is
              kept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="ban-reason">Reason</Label>
            <Input
              id="ban-reason"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !banPending) handleBan();
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setBanTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleBan}
              disabled={banPending}
            >
              {banPending && <Spinner size="sm" />}
              {banPending ? "Banning…" : "Ban user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(impersonateTarget)}
        onOpenChange={(o) => !o && setImpersonateTarget(null)}
        title={`Impersonate ${impersonateTarget?.name || "this user"}?`}
        description="You'll be signed in as them until you sign out."
        confirmLabel="Impersonate"
        onConfirm={handleImpersonate}
      />

      {/* Remove confirmation — hard delete, including solo-owned workspaces. */}
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name || "user"}?`}
        description={`Permanently deletes ${removeTarget?.email ?? "this user"}, their sessions, and any workspace only they belong to — including all tracked time in it. Workspaces shared with other members are kept. This cannot be undone.`}
        confirmLabel="Remove user"
        onConfirm={handleRemove}
      />
    </Pane>
  );
}
