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
  const { timerState } = (await chrome.storage.local.get("timerState")) as {
    timerState?: TimerState;
  };
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
        const { timerState, apiUrl, authToken } = (await chrome.storage.local.get([
          "timerState",
          "apiUrl",
          "authToken",
        ])) as { timerState?: TimerState; apiUrl?: string; authToken?: string };
        sendResponse({
          timerState: timerState ?? null,
          apiUrl: apiUrl ?? null,
          authToken: authToken ?? null,
        });
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
          await chrome.storage.local.set({
            timerState: {
              running: true,
              entryId: entry.id,
              startedAt: new Date(entry.start).getTime(),
              description: entry.description,
              projectId: entry.projectId,
            } as TimerState,
          });
          sendResponse({ ok: true, entry });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
        break;
      }

      case "STOP_TIMER": {
        const { timerState, apiUrl, authToken } = (await chrome.storage.local.get([
          "timerState",
          "apiUrl",
          "authToken",
        ])) as { timerState?: TimerState; apiUrl?: string; authToken?: string };
        if (!timerState?.running) {
          sendResponse({ ok: false, error: "No running timer" });
          break;
        }
        const base = apiUrl ?? "https://timetracker.blakebauman.dev";
        const headers: Record<string, string> = {};
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        try {
          const res = await fetch(
            `${base}/api/time_entries/${timerState.entryId}/stop`,
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
