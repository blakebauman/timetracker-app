import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

// Server text is not shown to the user: Better Auth's messages here are
// internal ("Delete user is disabled", token codes) and a fixed line reads better.
const SEND_FAILED = "Couldn't send the confirmation email";

export function DangerZoneCard() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // Passwords are retired, so deletion is confirmed by email: this only asks the
  // server to send the link (worker/auth.ts sendDeleteAccountVerification). The
  // account is deleted when the link is opened from this signed-in browser, and
  // Better Auth then redirects to callbackURL.
  const handleRequestLink = async () => {
    setPending(true);
    try {
      const { error } = await authClient.deleteUser({ callbackURL: "/login?deleted=1" });
      if (error) {
        toast.error(SEND_FAILED);
        return;
      }
      toast.success("Check your email — the deletion link is on its way");
      setOpen(false);
    } catch {
      toast.error(SEND_FAILED);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Delete account</p>
          <p className="mt-1 text-xs leading-normal text-muted-foreground">
            Permanently deletes your account and all associated data. This cannot be undone.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => setOpen(true)}
        >
          Delete account
        </Button>
      </CardContent>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and every time entry, project and report in your
              personal workspace. We&apos;ll email you a link to confirm — nothing happens until you click
              it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRequestLink();
              }}
              disabled={pending}
              variant="destructive"
            >
              {pending && <Spinner size="sm" className="mr-1.5" />}
              Email me the link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
