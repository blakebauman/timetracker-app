// MV3 service worker — state must live in chrome.storage, NOT in-memory variables
// (service workers are ephemeral and get terminated when idle)

interface TimerState {
  running: boolean;
  entryId: string;
  startedAt: number; // Unix ms
  description: string;
  projectId: string | null;
}

// ─── Alarm tick ──────────────────────────────────────────────────────────────

chrome.alarms.create("timer-tick", { periodInMinutes: 1 / 60 }); // ~1s

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "timer-tick") return;

  const stored = (await chrome.storage.local.get([
    "timerState",
    "apiUrl",
    "authToken",
  ])) as {
    timerState?: TimerState;
    apiUrl?: string;
    authToken?: string;
  };

  let { timerState } = stored;
  const { apiUrl, authToken } = stored;

  // Poll server on every tick to catch changes made from the web app.
  // Chrome clamps alarms to ~1 minute in production (1/60 is treated as 1 min),
  // so polling every tick is fine and avoids the 5-minute stale state window
  // that the old tickCount % 5 throttle caused.
  if (authToken) {
    const base = apiUrl ?? "https://timetracker.blakebauman.dev";
    try {
      const res = await fetch(`${base}/api/time_entries?running=true&limit=1`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const entries = (await res.json()) as Array<{
          id: string;
          start: string;
          description: string;
          projectId: string | null;
          stop: string | null;
        }>;
        const running = entries.find((e) => !e.stop);
        if (running) {
          timerState = {
            running: true,
            entryId: running.id,
            startedAt: new Date(running.start).getTime(),
            description: running.description,
            projectId: running.projectId,
          };
          await chrome.storage.local.set({ timerState });
        } else {
          timerState = undefined;
          await chrome.storage.local.remove("timerState");
        }
      }
    } catch {
      // Offline — keep using cached timerState
    }
  }

  if (!timerState?.running) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  const elapsed = Math.floor((Date.now() - timerState.startedAt) / 1000);
  chrome.action.setBadgeText({ text: formatBadge(elapsed) });
  chrome.action.setBadgeBackgroundColor({ color: "#e5291a" });
});

function formatBadge(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}m`;
}

// ─── Message handlers ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "GET_STATE": {
        // Respond immediately with cached storage so the channel closes before
        // the service worker can be terminated mid-await. The network refresh
        // runs in the background and updates storage for the next open.
        const stored = (await chrome.storage.local.get([
          "apiUrl",
          "authToken",
          "timerState",
        ])) as { apiUrl?: string; authToken?: string; timerState?: TimerState };

        sendResponse({
          timerState: stored.timerState ?? null,
          apiUrl: stored.apiUrl ?? null,
          authToken: stored.authToken ?? null,
        });

        // Fire-and-forget: refresh timer state from server in background
        if (stored.authToken) {
          const base = stored.apiUrl ?? "https://timetracker.blakebauman.dev";
          fetch(`${base}/api/time_entries?running=true&limit=1`, {
            headers: { Authorization: `Bearer ${stored.authToken}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((entries: Array<{ id: string; start: string; description: string; projectId: string | null; stop: string | null }> | null) => {
              if (!entries) return;
              const running = entries.find((e) => !e.stop);
              if (running) {
                chrome.storage.local.set({
                  timerState: {
                    running: true,
                    entryId: running.id,
                    startedAt: new Date(running.start).getTime(),
                    description: running.description,
                    projectId: running.projectId,
                  } as TimerState,
                });
              } else {
                chrome.storage.local.remove("timerState");
              }
            })
            .catch(() => {});
        }
        break;
      }

      case "SIGN_IN": {
        const { apiUrl } = (await chrome.storage.local.get("apiUrl")) as {
          apiUrl?: string;
        };
        const base = apiUrl ?? "https://timetracker.blakebauman.dev";
        try {
          const res = await fetch(`${base}/api/ext/sign-in`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: msg.email, password: msg.password }),
          });
          const data = (await res.json()) as {
            token?: string;
            user?: unknown;
            error?: string;
            message?: string;
          };
          if (!res.ok) {
            sendResponse({ ok: false, error: data.message ?? data.error ?? "Sign in failed" });
            break;
          }
          if (data.token) {
            await chrome.storage.local.set({ authToken: data.token });
          }
          sendResponse({ ok: true, user: data.user });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
        break;
      }

      case "SIGN_OUT": {
        await chrome.storage.local.remove(["authToken", "timerState"]);
        chrome.action.setBadgeText({ text: "" });
        sendResponse({ ok: true });
        break;
      }

      case "START_TIMER": {
        const { apiUrl, authToken } = (await chrome.storage.local.get([
          "apiUrl",
          "authToken",
        ])) as { apiUrl?: string; authToken?: string };
        const base = apiUrl ?? "https://timetracker.blakebauman.dev";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        try {
          const res = await fetch(`${base}/api/time_entries`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              description: msg.description ?? "",
              projectId: msg.projectId ?? null,
              start: new Date().toISOString(),
              billable: false,
              tags: [],
            }),
          });
          const entry = (await res.json()) as {
            id: string;
            start: string;
            description: string;
            projectId: string | null;
          };
          const startedAt = new Date(entry.start).getTime();
          await chrome.storage.local.set({
            timerState: {
              running: true,
              entryId: entry.id,
              startedAt,
              description: entry.description,
              projectId: entry.projectId,
            } as TimerState,
          });
          // Update badge immediately — don't wait for the next alarm tick
          chrome.action.setBadgeText({ text: formatBadge(Math.floor((Date.now() - startedAt) / 1000)) });
          chrome.action.setBadgeBackgroundColor({ color: "#e5291a" });
          sendResponse({ ok: true, entry });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
        break;
      }

      case "STOP_TIMER": {
        const { apiUrl, authToken } = (await chrome.storage.local.get([
          "apiUrl",
          "authToken",
        ])) as { apiUrl?: string; authToken?: string };
        const base = apiUrl ?? "https://timetracker.blakebauman.dev";
        const headers: Record<string, string> = {};
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        try {
          // Always fetch the current running entry from the server rather than
          // relying on the cached entryId — the web app may have started a
          // different timer since the extension last polled.
          const listRes = await fetch(`${base}/api/time_entries?running=true&limit=1`, { headers });
          if (!listRes.ok) { sendResponse({ ok: false, error: "Unauthorized" }); break; }
          const entries = (await listRes.json()) as Array<{ id: string; stop: string | null }>;
          const running = entries.find((e) => !e.stop);
          if (!running) {
            await chrome.storage.local.remove("timerState");
            chrome.action.setBadgeText({ text: "" });
            sendResponse({ ok: false, error: "No running timer" });
            break;
          }
          const res = await fetch(
            `${base}/api/time_entries/${running.id}/stop`,
            { method: "PATCH", headers }
          );
          const entry = await res.json();
          await chrome.storage.local.remove("timerState");
          chrome.action.setBadgeText({ text: "" });
          sendResponse({ ok: true, entry });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
        break;
      }

      case "TIMER_STATE_CHANGED": {
        // Relayed instantly from the web app via content script — no poll delay
        if (msg.state?.running) {
          const startedAt = new Date(msg.state.startedAt).getTime();
          await chrome.storage.local.set({
            timerState: {
              running: true,
              entryId: msg.state.entryId,
              startedAt,
              description: msg.state.description ?? "",
              projectId: msg.state.projectId ?? null,
            } as TimerState,
          });
          // Update badge immediately — don't wait for the next alarm tick
          chrome.action.setBadgeText({ text: formatBadge(Math.floor((Date.now() - startedAt) / 1000)) });
          chrome.action.setBadgeBackgroundColor({ color: "#e5291a" });
        } else {
          await chrome.storage.local.remove("timerState");
          chrome.action.setBadgeText({ text: "" });
        }
        sendResponse({ ok: true });
        break;
      }

      case "SET_API_URL": {
        await chrome.storage.local.set({ apiUrl: msg.url });
        sendResponse({ ok: true });
        break;
      }

      case "PAGE_CONTEXT": {
        // Store the latest page context so popup can pre-fill it
        await chrome.storage.session.set({ pageContext: msg.context });
        sendResponse({ ok: true });
        break;
      }
    }
  })();
  return true; // keep channel open for async response
});
