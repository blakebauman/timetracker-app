import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand/BrandMark";
import { BrandGlow } from "@/components/brand/BrandGlow";

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [status, setStatus] = useState<"pending" | "error">("pending");
  const [error, setError] = useState("");

  const invitationId = params.get("id");

  useEffect(() => {
    if (isLoading || !invitationId) return;

    if (!user) {
      // Invitee needs an account first — send them to sign up, then bounce back here.
      navigate(`/signup?redirect=${encodeURIComponent(`/accept-invite?id=${invitationId}`)}`);
      return;
    }

    authClient.organization.acceptInvitation({ invitationId }).then(({ error: acceptError }) => {
      if (acceptError) {
        setStatus("error");
        setError(acceptError.message ?? "This invitation is invalid or has expired.");
        return;
      }
      navigate("/");
    });
  }, [isLoading, user, invitationId, navigate]);

  if (!invitationId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Missing invitation.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo: the mark over a soft red halo, wordmark beneath. */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="relative flex items-center justify-center">
            <BrandGlow />
            <BrandMark className="relative size-16" />
          </div>
          <span className="text-2xl font-bold tracking-tight">Time Tracker</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h1" className="text-xl">Joining workspace…</CardTitle>
          </CardHeader>
          <CardContent>
            {status === "error" ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Please wait a moment.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
