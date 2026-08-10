import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Monitor, Smartphone, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { formatShortDate, formatEntryTime } from "@/lib/dateUtils";

// The auth client deserializes timestamps to Date; our formatters take ISO strings.
function toIso(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}

// Best-effort friendly label from a user-agent string.
function describeUserAgent(ua?: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Unknown device", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg/i.test(ua)
    ? "Edge"
    : /OPR|Opera/i.test(ua)
      ? "Opera"
      : /Chrome/i.test(ua)
        ? "Chrome"
        : /Firefox/i.test(ua)
          ? "Firefox"
          : /Safari/i.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS|Macintosh/i.test(ua)
      ? "macOS"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/i.test(ua)
          ? "iOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  return { label: os ? `${browser} · ${os}` : browser, mobile };
}

export function SessionsCard() {
  const queryClient = useQueryClient();
  const { data: current } = authClient.useSession();
  const currentToken = current?.session?.token;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.message ?? "Failed to load sessions");
      return data ?? [];
    },
  });

  const revoke = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await authClient.revokeSession({ token });
      if (error) throw new Error(error.message ?? "Failed to revoke session");
    },
    onSuccess: () => {
      toast.success("Session signed out");
      queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeOthers = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message ?? "Failed to sign out other sessions");
    },
    onSuccess: () => {
      toast.success("Signed out all other devices");
      queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const otherCount = sessions.filter((s) => s.token !== currentToken).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Active sessions</CardTitle>
        {otherCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out other devices
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : (
          sessions.map((s) => {
            const { label, mobile } = describeUserAgent(s.userAgent);
            const isCurrent = s.token === currentToken;
            const Icon = mobile ? Smartphone : Monitor;
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{label}</span>
                      {isCurrent && (
                        <Badge variant="secondary" className="text-micro">
                          This device
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.ipAddress || "Unknown IP"}
                      {s.createdAt &&
                        ` · signed in ${formatShortDate(toIso(s.createdAt))} ${formatEntryTime(toIso(s.createdAt))}`}
                    </p>
                  </div>
                </div>
                {!isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => revoke.mutate(s.token)}
                    disabled={revoke.isPending}
                  >
                    {revoke.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
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
