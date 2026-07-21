import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { Clock, KeyRound } from "lucide-react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.4 3.58v2.97h3.86c2.26-2.08 3.59-5.15 3.59-8.79z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.86-2.98c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.31A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.58.37-2.31V6.6H1.27A11.98 11.98 0 0 0 0 12c0 1.93.46 3.76 1.27 5.4l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.43-3.43C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.27 6.6l4 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState(() => {
    const oauthError = params.get("error");
    if (!oauthError) return "";
    if (oauthError === "account_not_linked") {
      return "An account with this email already exists but isn't linked to Google yet. Sign in with an email code or magic link to continue.";
    }
    return "Google sign-in failed. Please try again.";
  });

  // — Passwordless (email code / magic link) state
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [pending, setPending] = useState(false);

  // — Passkey state
  const [passkeyPending, setPasskeyPending] = useState(false);

  // Navigate only once the shared session store has actually caught up —
  // navigating right after a sign-in call resolves races AuthGuard's
  // useSession(), which can still read the stale "logged out" cache for a tick.
  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handlePasskeySignIn = async () => {
    setError("");
    setPasskeyPending(true);
    const res = await authClient.signIn.passkey();
    setPasskeyPending(false);
    if (res?.error) {
      setError(res.error.message ?? "Passkey sign-in failed");
    }
    // On success, the useEffect above navigates once `user` updates.
  };

  const handleGoogleSignIn = () => {
    authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login?error=google" });
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setError("");
    setPending(true);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setPending(false);
    if (sendError) {
      setError(sendError.message ?? "Failed to send code");
      return;
    }
    setCodeSent(true);
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setError("");
    setPending(true);
    const { error: verifyError } = await authClient.signIn.emailOtp({ email, otp: code });
    setPending(false);
    if (verifyError) {
      setError(verifyError.message ?? "Invalid or expired code");
      return;
    }
    // The useEffect above navigates once `user` updates.
  };

  const handleSendMagicLink = async () => {
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setError("");
    setPending(true);
    const { error: sendError } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/",
    });
    setPending(false);
    if (sendError) {
      setError(sendError.message ?? "Failed to send magic link");
      return;
    }
    setLinkSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Clock className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">Time Tracker</span>
        </div>

        <Card>
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Welcome back, clock-watcher</CardTitle>
            <CardDescription>
              Those billable hours won't track themselves. Sign in and let's
              make time accountable.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleGoogleSignIn}
            >
              <GoogleIcon />
              Continue with Google
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handlePasskeySignIn}
              disabled={passkeyPending}
            >
              <KeyRound className="h-4 w-4" />
              {passkeyPending ? "Waiting for passkey…" : "Sign in with a passkey"}
            </Button>

            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <form
              className="space-y-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (codeSent) handleVerifyCode();
                else handleSendCode();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCodeSent(false);
                    setLinkSent(false);
                    setCode("");
                  }}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              {codeSent ? (
                <div className="space-y-1.5">
                  <Label htmlFor="otp">6-digit code</Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    We emailed a code to {email}.
                  </p>
                </div>
              ) : null}

              {error && <p className="text-sm text-destructive">{error}</p>}
              {linkSent && (
                <p className="text-sm text-muted-foreground">
                  Magic link deployed. Check your inbox — no password
                  memorization required.
                </p>
              )}

              {codeSent ? (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={pending || !code.trim()}
                >
                  {pending ? "Verifying…" : "Verify code"}
                </Button>
              ) : (
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Sending…" : "Email me a code"}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                disabled={pending}
                onClick={handleSendMagicLink}
              >
                Or send me a magic link instead
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-0">
            <p className="text-center text-sm text-muted-foreground">
              New around here and still tracking time in a spreadsheet?{" "}
              <Link
                to="/signup"
                className="font-medium text-primary hover:underline"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
