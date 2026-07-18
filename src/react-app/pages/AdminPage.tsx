import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, Ban } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

  const { data: users = [], isLoading: loading } = useQuery({
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
    if (!banTarget) return;
    setBanPending(true);
    const { error } = await authClient.admin.banUser({
      userId: banTarget.id,
      banReason: banReason.trim() || DEFAULT_BAN_REASON,
    });
    setBanPending(false);
    if (error) {
      toast.error(error.message || "Failed to ban user");
      return;
    }
    setBanTarget(null);
    toast.success("User banned");
    refetchUsers();
  };

  const handleUnban = async (userId: string) => {
    const { error } = await authClient.admin.unbanUser({ userId });
    if (error) {
      toast.error(error.message || "Failed to unban user");
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

  const handleImpersonate = async (userId: string) => {
    const { error } = await authClient.admin.impersonateUser({ userId });
    if (error) {
      toast.error(error.message || "Failed to impersonate user");
      return;
    }
    window.location.href = "/";
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">Manage all timetracker.run users</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <EmptyState icon={Users} title="No users yet" description="Users will appear here once they sign up." />
          ) : (
            users.map((u) => (
              <div key={u.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
                <div>
                  <span className="font-medium">{u.name}</span>
                  <span className="ml-2 text-muted-foreground">{u.email}</span>
                  {u.role === "admin" && <Badge className="ml-2" variant="secondary">admin</Badge>}
                  {u.banned && <Badge className="ml-2" variant="destructive">banned</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {u.banned ? (
                    <Button size="sm" variant="outline" onClick={() => handleUnban(u.id)}>
                      Unban
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => openBanDialog(u)}>
                      Ban
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleImpersonate(u.id)}>
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
            ))
          )}
        </CardContent>
      </Card>

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
                if (e.key === "Enter") handleBan();
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
              {banPending ? "Banning…" : "Ban user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation — hard delete, including solo-owned workspaces. */}
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name || "user"}?`}
        description={`Permanently deletes ${removeTarget?.email ?? "this user"}, their sessions, and any workspace only they belong to — including all tracked time in it. Workspaces shared with other members are kept. This cannot be undone.`}
        confirmLabel="Remove user"
        onConfirm={handleRemove}
      />
    </div>
  );
}
