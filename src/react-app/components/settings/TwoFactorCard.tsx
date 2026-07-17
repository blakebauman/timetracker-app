import { useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Stage = "idle" | "password" | "enroll";

export function TwoFactorCard() {
  const { data: session } = authClient.useSession();
  const enabled = Boolean(session?.user?.twoFactorEnabled);

  const [stage, setStage] = useState<Stage>("idle");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  // "enable" starts enrollment; "disable" tears down; "regen" makes new backup codes.
  const [intent, setIntent] = useState<"enable" | "disable" | "regen">("enable");

  const reset = () => {
    setStage("idle");
    setPassword("");
    setQr("");
    setSecret("");
    setBackupCodes([]);
    setCode("");
    setCopied(false);
  };

  const askPassword = (next: "enable" | "disable" | "regen") => {
    setIntent(next);
    setStage("password");
    setPassword("");
  };

  const handlePasswordSubmit = async () => {
    if (!password) return;
    setPending(true);
    try {
      if (intent === "enable") {
        const { data, error } = await authClient.twoFactor.enable({ password });
        if (error) throw new Error(error.message ?? "Incorrect password");
        const uri = data?.totpURI ?? "";
        setSecret(new URL(uri).searchParams.get("secret") ?? "");
        setBackupCodes(data?.backupCodes ?? []);
        setQr(await QRCode.toDataURL(uri, { margin: 1, width: 220 }));
        setStage("enroll");
      } else if (intent === "disable") {
        const { error } = await authClient.twoFactor.disable({ password });
        if (error) throw new Error(error.message ?? "Incorrect password");
        toast.success("Two-factor authentication disabled");
        reset();
      } else {
        const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
        if (error) throw new Error(error.message ?? "Incorrect password");
        setBackupCodes(data?.backupCodes ?? []);
        setStage("enroll");
        toast.success("New backup codes generated");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  const handleVerify = async () => {
    if (code.length < 6) return;
    setPending(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) throw new Error(error.message ?? "Invalid code");
      toast.success("Two-factor authentication enabled");
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setPending(false);
    }
  };

  const copyBackupCodes = async () => {
    await navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    toast.success("Backup codes copied");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Two-factor authentication</CardTitle>
          {enabled && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <ShieldCheck className="h-3 w-3" /> On
            </Badge>
          )}
        </div>
        {stage === "idle" &&
          (enabled ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => askPassword("regen")}>
                Backup codes
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => askPassword("disable")}
              >
                Disable
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => askPassword("enable")}>
              Enable
            </Button>
          ))}
      </CardHeader>
      <CardContent className="space-y-4">
        {stage === "idle" && (
          <p className="text-sm leading-normal text-muted-foreground">
            {enabled
              ? "You'll be asked for a code from your authenticator app when you sign in."
              : "Add an authenticator app (TOTP) as a second step when signing in."}
          </p>
        )}

        {stage === "password" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tfa-password">Confirm your password</Label>
              <Input
                id="tfa-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                autoFocus
                className="h-9"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePasswordSubmit} disabled={pending || !password}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Continue
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {stage === "enroll" && (
          <div className="space-y-4">
            {qr && (
              <div className="space-y-3">
                <p className="text-sm leading-normal text-muted-foreground">
                  Scan this QR code with your authenticator app, then enter the 6-digit code to finish.
                </p>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <img src={qr} alt="Two-factor QR code" className="rounded-md border" width={160} height={160} />
                  {secret && (
                    <div className="text-xs leading-normal text-muted-foreground">
                      <p className="mb-1">Or enter this key manually:</p>
                      <code className="rounded bg-muted px-1.5 py-1 font-mono break-all">{secret}</code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {backupCodes.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium">
                    Backup codes — store these somewhere safe
                  </p>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={copyBackupCodes}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-3">
                  {backupCodes.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </div>
            )}

            {qr ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    className="h-9 w-32 font-mono tracking-widest"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleVerify} disabled={pending || code.length < 6}>
                    {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Verify &amp; finish
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={reset}>
                Done
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
