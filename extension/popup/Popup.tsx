import { useState, useEffect, useRef } from "react";
import { normalizeApiUrl, DEFAULT_API_URL } from "../lib/apiUrl";
import { makeAuthClient, type ExtAuthClient } from "../lib/auth-client";

interface TimerState {
  running: boolean;
  entryId: string;
  startedAt: number;
  description: string;
  projectId: string | null;
}

// CSS variable shortcuts
const c = {
  bg: "var(--bg)",
  bgMuted: "var(--bg-muted)",
  fg: "var(--fg)",
  fgMuted: "var(--fg-muted)",
  border: "var(--border)",
  inputBorder: "var(--input-border)",
  accentBg: "var(--accent-bg)",
  brand: "var(--brand)",
  brandDisabled: "var(--brand-disabled)",
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function Popup() {
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [description, setDescription] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState<string>(DEFAULT_API_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrlError, setApiUrlError] = useState<string | null>(null);
  const [user, setUser] = useState<{ email: string; name?: string } | null>(null);
  const clientRef = useRef<ExtAuthClient | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Load state on mount. GET_STATE gives us the stored apiUrl + timer state (and
  // nudges the service worker to refresh timer state from the server). We then
  // build the auth client against that apiUrl and validate the session.
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, async (res) => {
      const base = (res?.apiUrl && normalizeApiUrl(res.apiUrl)) || DEFAULT_API_URL;
      setApiUrl(base);
      if (res?.timerState) {
        setTimerState(res.timerState);
        setDescription(res.timerState.description);
      }
      const client = makeAuthClient(base);
      clientRef.current = client;
      try {
        const { data } = await client.getSession();
        if (data?.user) setUser({ email: data.user.email, name: data.user.name });
      } catch {
        // Offline or unreachable backend — treat as signed out for now.
      }
      setInitializing(false);
    });

    chrome.storage.session.get("pageContext", ({ pageContext }) => {
      if (pageContext) setDescription((d) => d || (pageContext as string));
    });
  }, []);

  // Reactively drop to the login form when the token is cleared from storage —
  // e.g. the service worker got a 401 on a poll and cleared it (authedFetch).
  useEffect(() => {
    const handler = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== "local") return;
      if ("authToken" in changes && !changes.authToken?.newValue) {
        setUser(null);
        setTimerState(null);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // Tick
  useEffect(() => {
    if (!timerState?.running) return;
    const tick = () =>
      setElapsed(Math.floor((Date.now() - timerState.startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerState?.running, timerState?.startedAt]);

  const handleSendCode = async () => {
    const client = clientRef.current;
    if (!client || !loginEmail.trim()) return;
    setLoginLoading(true);
    setLoginError(null);
    const { error } = await client.emailOtp.sendVerificationOtp({
      email: loginEmail,
      type: "sign-in",
    });
    setLoginLoading(false);
    if (error) {
      setLoginError(error.message ?? "Failed to send code");
      return;
    }
    setCodeSent(true);
  };

  const handleVerifyCode = async () => {
    const client = clientRef.current;
    if (!client || !loginCode.trim()) return;
    setLoginLoading(true);
    setLoginError(null);
    // Standard better-auth client. The bearer() plugin returns the token in the
    // `set-auth-token` header, which the client's onSuccess persists to
    // chrome.storage.local for the service worker to reuse.
    const { data, error } = await client.signIn.emailOtp({
      email: loginEmail,
      otp: loginCode,
    });
    setLoginLoading(false);
    if (error || !data) {
      setLoginError(error?.message ?? "Invalid or expired code");
      return;
    }
    setUser({ email: data.user.email, name: data.user.name });
    setLoginCode("");
    setCodeSent(false);
    // Now that a token is stored, nudge the worker to refresh the badge/timer.
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
      if (state?.timerState) {
        setTimerState(state.timerState);
        setDescription(state.timerState.description);
      }
    });
  };

  const handleSignOut = async () => {
    // Revoke server-side first (needs the bearer token, still in storage), then
    // clear local state and reset the badge.
    try {
      await clientRef.current?.signOut();
    } catch {
      // Ignore network errors — we clear locally regardless.
    }
    await chrome.storage.local.remove(["authToken", "timerState"]);
    chrome.runtime.sendMessage({ type: "SIGN_OUT" });
    setUser(null);
    setTimerState(null);
    setDescription("");
    setElapsed(0);
    setShowSettings(false);
  };

  const handleStart = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ type: "START_TIMER", description }, (res) => {
      setLoading(false);
      if (res?.ok) {
        setTimerState({
          running: true,
          entryId: res.entry.id,
          startedAt: new Date(res.entry.start).getTime(),
          description,
          projectId: null,
        });
      }
    });
  };

  const handleStop = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ type: "STOP_TIMER" }, (res) => {
      setLoading(false);
      if (res?.ok) {
        setTimerState(null);
        setDescription("");
        setElapsed(0);
      }
    });
  };

  const handleSaveApiUrl = () => {
    const normalized = normalizeApiUrl(apiUrl);
    if (!normalized) {
      setApiUrlError("Must be timetracker.run, a *.workers.dev URL, or localhost");
      return;
    }
    setApiUrlError(null);
    chrome.runtime.sendMessage(
      { type: "SET_API_URL", url: normalized },
      async (res) => {
        if (res?.ok) {
          const base = res.url ?? normalized;
          setApiUrl(base);
          // Rebuild the client against the new backend and re-check the session.
          const client = makeAuthClient(base);
          clientRef.current = client;
          try {
            const { data } = await client.getSession();
            setUser(data?.user ? { email: data.user.email, name: data.user.name } : null);
          } catch {
            setUser(null);
          }
          setShowSettings(false);
        } else {
          setApiUrlError(res?.error ?? "Could not save API URL");
        }
      }
    );
  };

  const isRunning = timerState?.running;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${c.inputBorder}`,
    borderRadius: 4,
    padding: "6px 8px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    background: c.bg,
    color: c.fg,
  };

  const btnPrimary = (disabled: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "8px 0",
    background: disabled ? c.brandDisabled : c.brand,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (initializing) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${c.border}`, background: c.bg }}>
          <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: c.fgMuted, letterSpacing: 1 }}>
            00:00:00
          </span>
        </div>
        <div style={{ padding: "12px 14px", height: 80 }} />
      </div>
    );
  }

  // ── Login form ───────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${c.border}`, background: c.bg }}>
          <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: c.fgMuted, letterSpacing: 1 }}>
            00:00:00
          </span>
        </div>

        <div style={{ padding: "14px" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: c.fg, marginBottom: 10 }}>
            Sign in to Time Tracker
          </p>
          <label style={{ fontSize: 12, color: c.fgMuted, display: "block", marginBottom: 3 }}>Email</label>
          <input
            type="email"
            value={loginEmail}
            onChange={(e) => {
              setLoginEmail(e.target.value);
              setCodeSent(false);
              setLoginCode("");
            }}
            onKeyDown={(e) => e.key === "Enter" && (codeSent ? handleVerifyCode() : handleSendCode())}
            placeholder="you@example.com"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          {codeSent && (
            <>
              <label style={{ fontSize: 12, color: c.fgMuted, display: "block", marginBottom: 3 }}>
                6-digit code (check your email)
              </label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                placeholder="123456"
                autoFocus
                style={{ ...inputStyle, marginBottom: 10 }}
              />
            </>
          )}
          {loginError && (
            <p style={{ fontSize: 12, color: c.brand, marginBottom: 8 }}>{loginError}</p>
          )}
          {codeSent ? (
            <button
              onClick={handleVerifyCode}
              disabled={loginLoading || !loginCode.trim()}
              style={btnPrimary(loginLoading || !loginCode.trim())}
            >
              {loginLoading ? "Verifying..." : "Verify code"}
            </button>
          ) : (
            <button onClick={handleSendCode} disabled={loginLoading} style={btnPrimary(loginLoading)}>
              {loginLoading ? "Sending..." : "Email me a code"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Authenticated UI ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px",
        borderBottom: `1px solid ${c.border}`,
        background: isRunning ? c.accentBg : c.bg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isRunning && (
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: c.brand, animation: "pulse 1.5s infinite", flexShrink: 0,
            }} />
          )}
          <span style={{
            fontFamily: "monospace", fontSize: 22, fontWeight: 700,
            color: isRunning ? c.brand : c.fgMuted, letterSpacing: 1,
          }}>
            {isRunning ? formatElapsed(elapsed * 1000) : "00:00:00"}
          </span>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 18, color: c.fgMuted, padding: "2px 6px",
        }} title="Settings">⚙</button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${c.border}`, background: c.bgMuted }}>
          <label style={{ fontSize: 12, color: c.fgMuted, display: "block", marginBottom: 4 }}>API URL</label>
          <div style={{ display: "flex", gap: 6, marginBottom: apiUrlError ? 4 : 8 }}>
            <input
              value={apiUrl}
              onChange={(e) => { setApiUrl(e.target.value); setApiUrlError(null); }}
              style={{ ...inputStyle, padding: "4px 8px", fontSize: 12 }}
              placeholder="https://your-worker.workers.dev"
            />
            <button onClick={handleSaveApiUrl} style={{
              background: c.brand, color: "#fff", border: "none",
              borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer",
            }}>Save</button>
          </div>
          {apiUrlError && (
            <p style={{ fontSize: 11, color: c.brand, margin: "0 0 8px" }}>{apiUrlError}</p>
          )}
          {user && (
            <p style={{ fontSize: 11, color: c.fgMuted, margin: "0 0 6px" }}>
              Signed in as {user.email}
            </p>
          )}
          <button onClick={handleSignOut} style={{
            width: "100%", padding: "5px 0", background: "none",
            color: c.brand, border: `1px solid ${c.brand}`,
            borderRadius: 4, fontSize: 12, cursor: "pointer",
          }}>Sign out</button>
        </div>
      )}

      {/* Timer controls */}
      <div style={{ padding: "12px 14px" }}>
        {isRunning ? (
          <div>
            <p style={{
              fontSize: 12, color: c.fgMuted, marginBottom: 4,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {timerState.description || "No description"}
            </p>
            <button onClick={handleStop} disabled={loading} style={btnPrimary(loading)}>
              {loading ? "Stopping..." : "■ Stop"}
            </button>
          </div>
        ) : (
          <div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              placeholder="What are you working on?"
              style={{ ...inputStyle, borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}
            />
            <button onClick={handleStart} disabled={loading} style={{
              ...btnPrimary(loading),
              background: loading ? "#94a3b8" : c.brand,
            }}>
              {loading ? "Starting..." : "▶ Start"}
            </button>
          </div>
        )}
      </div>

      {/* Open app link */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${c.border}`, textAlign: "center" }}>
        <a href={apiUrl.replace(/\/api.*$/, "")} target="_blank" rel="noreferrer"
          style={{ fontSize: 11, color: c.fgMuted, textDecoration: "none" }}>
          Open Time Tracker →
        </a>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        input { color-scheme: light dark; }
      `}</style>
    </div>
  );
}
