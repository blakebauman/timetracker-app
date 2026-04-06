import { useState, useEffect } from "react";

interface TimerState {
  running: boolean;
  entryId: string;
  startedAt: number;
  description: string;
  projectId: string | null;
}

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
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState<string>("https://timetracker.blakebauman.dev");
  const [showSettings, setShowSettings] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Load state on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
      if (res?.timerState) {
        setTimerState(res.timerState);
        setDescription(res.timerState.description);
      }
      if (res?.apiUrl) setApiUrl(res.apiUrl);
      if (res?.authToken) setAuthToken(res.authToken);
    });

    // Check for page context (pre-fill from content script)
    chrome.storage.session.get("pageContext", ({ pageContext }) => {
      if (pageContext && !timerState) {
        setDescription(pageContext as string);
      }
    });
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

  const handleSignIn = () => {
    setLoginLoading(true);
    setLoginError(null);
    chrome.runtime.sendMessage(
      { type: "SIGN_IN", email: loginEmail, password: loginPassword },
      (res) => {
        setLoginLoading(false);
        if (res?.ok) {
          setAuthToken(res.user?.token ?? loginEmail); // store token indicator
          // Re-fetch state to get the stored token
          chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
            if (state?.authToken) setAuthToken(state.authToken);
          });
          setUserEmail(loginEmail);
        } else {
          setLoginError(res?.error ?? "Sign in failed");
        }
      }
    );
  };

  const handleSignOut = () => {
    chrome.runtime.sendMessage({ type: "SIGN_OUT" }, () => {
      setAuthToken(null);
      setUserEmail(null);
      setTimerState(null);
      setDescription("");
      setElapsed(0);
      setShowSettings(false);
    });
  };

  const handleStart = () => {
    setLoading(true);
    chrome.runtime.sendMessage(
      { type: "START_TIMER", description },
      (res) => {
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
      }
    );
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
    chrome.runtime.sendMessage({ type: "SET_API_URL", url: apiUrl }, () => {
      setShowSettings(false);
    });
  };

  const isRunning = timerState?.running;

  // ── Login form ───────────────────────────────────────────────────────────────
  if (!authToken) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Header */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid #e5e7eb",
            background: "#fff",
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 22,
              fontWeight: 700,
              color: "#9ca3af",
              letterSpacing: 1,
            }}
          >
            00:00:00
          </span>
        </div>

        {/* Sign in form */}
        <div style={{ padding: "14px 14px" }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#374151",
              marginBottom: 10,
              marginTop: 0,
            }}
          >
            Sign in to Time Tracker
          </p>
          <label
            style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 3 }}
          >
            Email
          </label>
          <input
            type="email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            placeholder="you@example.com"
            style={{
              width: "100%",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              padding: "6px 8px",
              fontSize: 13,
              marginBottom: 8,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <label
            style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 3 }}
          >
            Password
          </label>
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            placeholder="••••••••"
            style={{
              width: "100%",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              padding: "6px 8px",
              fontSize: 13,
              marginBottom: 10,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {loginError && (
            <p
              style={{
                fontSize: 12,
                color: "#e5291a",
                marginBottom: 8,
                marginTop: 0,
              }}
            >
              {loginError}
            </p>
          )}
          <button
            onClick={handleSignIn}
            disabled={loginLoading}
            style={{
              width: "100%",
              padding: "8px 0",
              background: loginLoading ? "#fca5a5" : "#e5291a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 14,
              cursor: loginLoading ? "not-allowed" : "pointer",
            }}
          >
            {loginLoading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    );
  }

  // ── Authenticated UI ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid #e5e7eb",
          background: isRunning ? "#fef2f2" : "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isRunning && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#e5291a",
                animation: "pulse 1.5s infinite",
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 22,
              fontWeight: 700,
              color: isRunning ? "#e5291a" : "#9ca3af",
              letterSpacing: 1,
            }}
          >
            {isRunning ? formatElapsed(elapsed * 1000) : "00:00:00"}
          </span>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: "#9ca3af",
            padding: "2px 6px",
          }}
          title="Settings"
        >
          ⚙
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f9fafb",
          }}
        >
          <label
            style={{
              fontSize: 12,
              color: "#6b7280",
              display: "block",
              marginBottom: 4,
            }}
          >
            API URL
          </label>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              style={{
                flex: 1,
                border: "1px solid #d1d5db",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: 12,
              }}
              placeholder="https://your-worker.workers.dev"
            />
            <button
              onClick={handleSaveApiUrl}
              style={{
                background: "#e5291a",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
          {userEmail && (
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 6px" }}>
              Signed in as {userEmail}
            </p>
          )}
          <button
            onClick={handleSignOut}
            style={{
              width: "100%",
              padding: "5px 0",
              background: "none",
              color: "#e5291a",
              border: "1px solid #e5291a",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      )}

      {/* Timer controls */}
      <div style={{ padding: "12px 14px" }}>
        {isRunning ? (
          <div>
            <p
              style={{
                fontSize: 12,
                color: "#6b7280",
                marginBottom: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {timerState.description || "No description"}
            </p>
            <button
              onClick={handleStop}
              disabled={loading}
              style={{
                width: "100%",
                padding: "8px 0",
                background: loading ? "#fca5a5" : "#e5291a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
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
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 13,
                marginBottom: 8,
                outline: "none",
              }}
            />
            <button
              onClick={handleStart}
              disabled={loading}
              style={{
                width: "100%",
                padding: "8px 0",
                background: loading ? "#94a3b8" : "#e5291a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Starting..." : "▶ Start"}
            </button>
          </div>
        )}
      </div>

      {/* Open app link */}
      <div
        style={{
          padding: "8px 14px",
          borderTop: "1px solid #e5e7eb",
          textAlign: "center",
        }}
      >
        <a
          href={apiUrl.replace(/\/api.*$/, "")}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 11, color: "#9ca3af", textDecoration: "none" }}
        >
          Open Time Tracker →
        </a>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
