import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
};

export function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  const handleBan = async (userId: string) => {
    const banReason = window.prompt("Reason for banning this user?", "Violation of terms");
    if (banReason === null) return; // cancelled
    const { error } = await authClient.admin.banUser({
      userId,
      banReason: banReason.trim() || "Violation of terms",
    });
    if (error) {
      toast.error(error.message || "Failed to ban user");
      return;
    }
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
                    <Button size="sm" variant="outline" onClick={() => handleBan(u.id)}>
                      Ban
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleImpersonate(u.id)}>
                    Impersonate
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
