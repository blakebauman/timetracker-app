import { useState } from "react";
import { Pencil, Check, X, BadgeCheck, MailWarning, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";

export function AccountCard() {
  const { user } = useAuth();

  // — Name
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name ?? "");

  // — Avatar (image URL)
  const [editingImage, setEditingImage] = useState(false);
  const [imageValue, setImageValue] = useState(user?.image ?? "");
  const [imagePending, setImagePending] = useState(false);

  // — Email verification
  const [verifyStage, setVerifyStage] = useState<"idle" | "code">("idle");
  const [otp, setOtp] = useState("");
  const [verifyPending, setVerifyPending] = useState(false);

  // — Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);

  const emailVerified = Boolean(user?.emailVerified);

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    const { error } = await authClient.updateUser({ name: trimmed });
    if (error) return toast.error(error.message ?? "Failed to update name");
    toast.success("Name updated");
    setEditingName(false);
  };

  const handleSaveImage = async () => {
    setImagePending(true);
    const { error } = await authClient.updateUser({ image: imageValue.trim() || null });
    setImagePending(false);
    if (error) return toast.error(error.message ?? "Failed to update photo");
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
    if (error) return toast.error(error.message ?? "Failed to send code");
    toast.success("Verification code sent — check your email");
    setVerifyStage("code");
  };

  const handleVerifyEmail = async () => {
    if (!user?.email || otp.length < 6) return;
    setVerifyPending(true);
    const { error } = await authClient.emailOtp.verifyEmail({ email: user.email, otp });
    setVerifyPending(false);
    if (error) return toast.error(error.message ?? "Invalid code");
    toast.success("Email verified");
    setVerifyStage("idle");
    setOtp("");
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setPasswordPending(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    });
    setPasswordPending(false);
    if (error) return toast.error(error.message ?? "Failed to change password");
    toast.success("Password changed");
    setCurrentPassword("");
    setNewPassword("");
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                />
                <Button size="icon-sm" variant="ghost" className="shrink-0" onClick={handleSaveName} aria-label="Save name">
                  <Check className="h-4 w-4 text-success" />
                </Button>
                <Button size="icon-sm" variant="ghost" className="shrink-0" onClick={() => setEditingName(false)} aria-label="Cancel">
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
              {imagePending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
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
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <BadgeCheck className="h-3 w-3 text-success" /> Verified
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-[10px] text-warning">
                <MailWarning className="h-3 w-3" /> Unverified
              </Badge>
            )}
            {!emailVerified && verifyStage === "idle" && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSendVerification} disabled={verifyPending}>
                {verifyPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
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
                {verifyPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setVerifyStage("idle")}>
                Cancel
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Change password */}
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleChangePassword();
          }}
        >
          <Label>Change password</Label>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="h-8 text-sm"
            />
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="h-8 text-sm"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={passwordPending || !currentPassword || !newPassword}>
            {passwordPending ? "Saving…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
