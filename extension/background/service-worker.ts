// MV3 service worker — state must live in chrome.storage, NOT in-memory variables
// (service workers are ephemeral and get terminated when idle)

import { DEFAULT_API_URL, normalizeApiUrl } from "../lib/apiUrl";

interface TimerState {
  running: boolean;
  entryId: string;
  startedAt: number; // Unix ms
  description: string;
  projectId: string | null;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

// Re-validate the stored apiUrl on every read. Even though SET_API_URL rejects
// bad values, this neutralizes any value that predates the allow-list and keeps
// the bearer token from ever being sent to an unapproved origin.
function resolveBase(apiUrl?: string): string {
  return (apiUrl && normalizeApiUrl(apiUrl)) || DEFAULT_API_URL;
}

async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove(["authToken", "timerState"]);
  chrome.action.setBadgeText({ text: "" });
}

// Centralized authenticated fetch: attaches the bearer header and, on a 401,
// clears the (expired/revoked) token so the popup drops back to the login form
// instead of silently reusing a dead credential. Returns null on 401.
async function authedFetch(
  base: string,
  path: string,
  authToken: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${authToken}`);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (res.status === 401) {
    await clearAuth();
    return null;
  }
  return res;
}

function isValidTimerSync(state: unknown): state is {
  running: boolean;
  entryId?: string;
  startedAt?: string | number;
  description?: string;
  projectId?: string | null;
} {
  if (!state || typeof state !== "object") return false;
  const s = state as Record<string, unknown>;
  if (s.running === false) return true;
  if (s.running !== true) return false;
  if (typeof s.entryId !== "string" || s.entryId.length === 0) return false;
  return Number.isFinite(new Date(s.startedAt as string | number).getTime());
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
    const base = resolveBase(apiUrl);
    try {
      const res = await authedFetch(
        base,
        "/api/time_entries?running=true&limit=1",
        authToken,
      );
      if (res === null) {
        // 401 — token cleared by authedFetch; drop the badge and stop.
        chrome.action.setBadgeText({ text: "" });
        return;
      }
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Defense-in-depth: only accept messages from our own extension contexts
  // (popup + our content scripts). External senders have a different id.
  if (sender.id !== chrome.runtime.id) return;

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
          const base = resolveBase(stored.apiUrl);
          authedFetch(
            base,
            "/api/time_entries?running=true&limit=1",
            stored.authToken,
          )
            .then((r) => (r && r.ok ? r.json() : null))
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

      // Sign-in is handled in the popup by the standard better-auth client
      // (extension/lib/auth-client.ts), which stores the bearer token in
      // chrome.storage.local for this worker to reuse.

      case "SIGN_OUT": {
        await clearAuth();
        sendResponse({ ok: true });
        break;
      }

      case "START_TIMER": {
        const { apiUrl, authToken } = (await chrome.storage.local.get([
          "apiUrl",
          "authToken",
        ])) as { apiUrl?: string; authToken?: string };
        if (!authToken) {
          sendResponse({ ok: false, error: "Not signed in" });
          break;
        }
        const base = resolveBase(apiUrl);
        try {
          const res = await authedFetch(base, "/api/time_entries", authToken, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: msg.description ?? "",
              projectId: msg.projectId ?? null,
              start: new Date().toISOString(),
              billable: false,
              tags: [],
            }),
          });
          if (!res || !res.ok) {
            sendResponse({ ok: false, error: res ? "Failed to start timer" : "Session expired" });
            break;
          }
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
        if (!authToken) {
          sendResponse({ ok: false, error: "Not signed in" });
          break;
        }
        const base = resolveBase(apiUrl);
        try {
          // Always fetch the current running entry from the server rather than
          // relying on the cached entryId — the web app may have started a
          // different timer since the extension last polled.
          const listRes = await authedFetch(
            base,
            "/api/time_entries?running=true&limit=1",
            authToken,
          );
          if (!listRes || !listRes.ok) {
            sendResponse({ ok: false, error: listRes ? "Failed to load timer" : "Session expired" });
            break;
          }
          const entries = (await listRes.json()) as Array<{ id: string; stop: string | null }>;
          const running = entries.find((e) => !e.stop);
          if (!running) {
            await chrome.storage.local.remove("timerState");
            chrome.action.setBadgeText({ text: "" });
            sendResponse({ ok: false, error: "No running timer" });
            break;
          }
          const res = await authedFetch(
            base,
            `/api/time_entries/${running.id}/stop`,
            authToken,
            { method: "PATCH" },
          );
          if (!res || !res.ok) {
            sendResponse({ ok: false, error: res ? "Failed to stop timer" : "Session expired" });
            break;
          }
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
        // Relayed from the web app via the content script. The content script
        // only registers this relay on our own origins, but validate the shape
        // here too before trusting it into storage.
        if (!isValidTimerSync(msg.state)) {
          sendResponse({ ok: false, error: "Invalid state" });
          break;
        }
        if (msg.state.running) {
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
        const normalized = normalizeApiUrl(msg.url ?? "");
        if (!normalized) {
          sendResponse({ ok: false, error: "Unsupported API URL" });
          break;
        }
        await chrome.storage.local.set({ apiUrl: normalized });
        sendResponse({ ok: true, url: normalized });
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
