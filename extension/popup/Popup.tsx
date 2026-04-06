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
  const [apiUrl, setApiUrl] = useState<string>("http://localhost:8787");
  const [showSettings, setShowSettings] = useState(false);

  // Load state on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
      if (res?.timerState) {
        setTimerState(res.timerState);
        setDescription(res.timerState.description);
      }
      if (res?.apiUrl) setApiUrl(res.apiUrl);
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
          <div style={{ display: "flex", gap: 6 }}>
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
