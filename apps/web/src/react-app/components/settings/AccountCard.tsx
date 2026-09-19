import { useState } from "react";
import { Pencil, Check, X, BadgeCheck, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { mutationErrorMessage } from "@/lib/api";

export function AccountCard() {
  const { user } = useAuth();

  // — Name
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name ?? "");
  const [namePending, setNamePending] = useState(false);

  // — Avatar (image URL)
  const [editingImage, setEditingImage] = useState(false);
  const [imageValue, setImageValue] = useState(user?.image ?? "");
  const [imagePending, setImagePending] = useState(false);

  // — Email verification
  const [verifyStage, setVerifyStage] = useState<"idle" | "code">("idle");
  const [otp, setOtp] = useState("");
  const [verifyPending, setVerifyPending] = useState(false);

  const emailVerified = Boolean(user?.emailVerified);

  // Better Auth's error is a plain object, never an ApiError, so every handler
  // below lands on its curated line — the server's wording never reaches a toast.
  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    // Enter and the check button both land here; the flag keeps a fast pair
    // of them from sending the same name twice.
    if (!trimmed || namePending) return;
    setNamePending(true);
    const { error } = await authClient.updateUser({ name: trimmed });
    setNamePending(false);
    if (error) return toast.error(mutationErrorMessage(error, "Couldn't update your name"));
    toast.success("Name updated");
    setEditingName(false);
  };

  const handleSaveImage = async () => {
    setImagePending(true);
    const { error } = await authClient.updateUser({ image: imageValue.trim() || null });
    setImagePending(false);
    if (error) return toast.error(mutationErrorMessage(error, "Couldn't update your photo"));
    toast.success("Photo updated");
    setEditingImage(false);
  };

  const handleSendVerification = async () => {
    if (!user?.email) return;
    setVerifyPending(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: user.email,
      type: "email-verification",
    });
    setVerifyPending(false);
    if (error) return toast.error(mutationErrorMessage(error, "Couldn't send the verification code"));
    toast.success("Verification code sent — check your email");
    setVerifyStage("code");
  };

  const handleVerifyEmail = async () => {
    if (!user?.email || otp.length < 6) return;
    setVerifyPending(true);
    const { error } = await authClient.emailOtp.verifyEmail({ email: user.email, otp });
    setVerifyPending(false);
    if (error) return toast.error(mutationErrorMessage(error, "That code didn't match — check it and try again"));
    toast.success("Email verified");
    setVerifyStage("idle");
    setOtp("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          <UserAvatar name={user?.name} email={user?.email} image={user?.image} className="h-14 w-14 text-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Label>Name</Label>
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-8 text-sm"
                  aria-label="Name"
                  disabled={namePending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={handleSaveName}
                  disabled={namePending}
                  aria-label="Save name"
                  title="Save name"
                >
                  {namePending ? <Spinner size="sm" /> : <Check className="h-4 w-4 text-success" />}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => setEditingName(false)}
                  disabled={namePending}
                  aria-label="Cancel"
                  title="Cancel"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm">{user?.name ?? "—"}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => {
                    setNameValue(user?.name ?? "");
                    setEditingName(true);
                  }}
                  aria-label="Edit name"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          {editingImage ? null : (
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-xs text-muted-foreground"
              onClick={() => {
                setImageValue(user?.image ?? "");
                setEditingImage(true);
              }}
            >
              Change photo
            </Button>
          )}
        </div>

        {editingImage && (
          <div className="flex items-center gap-2">
            <Input
              value={imageValue}
              onChange={(e) => setImageValue(e.target.value)}
              placeholder="https://…/avatar.png"
              aria-label="Avatar image URL"
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={handleSaveImage} disabled={imagePending}>
              {imagePending && <Spinner size="sm" className="mr-1.5" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingImage(false)}>
              Cancel
            </Button>
          </div>
        )}

        <Separator />

        {/* Email + verification */}
        <div className="space-y-2">
          <Label>Email</Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">{user?.email ?? "—"}</span>
            {emailVerified ? (
              <Badge variant="secondary" className="gap-1 text-micro">
                <BadgeCheck className="h-3 w-3 text-success-ink" /> Verified
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-micro text-warning-ink">
                <MailWarning className="h-3 w-3" /> Unverified
              </Badge>
            )}
            {!emailVerified && verifyStage === "idle" && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSendVerification} disabled={verifyPending}>
                {verifyPending && <Spinner size="sm" className="mr-1.5" />}
                Verify email
              </Button>
            )}
          </div>
          {verifyStage === "code" && (
            <div className="flex items-center gap-2 pt-1">
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyEmail()}
                className="h-8 w-32 font-mono tracking-widest"
                autoFocus
              />
              <Button size="sm" onClick={handleVerifyEmail} disabled={verifyPending || otp.length < 6}>
                {verifyPending && <Spinner size="sm" className="mr-1.5" />}
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setVerifyStage("idle")}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
