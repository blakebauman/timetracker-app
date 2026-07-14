# Chrome Extension Security Audit

**Target:** `extension/` — Time Tracker MV3 Chrome extension (v1.0.2)
**Date:** 2026-07-13
**Reference:** Cross-checked against [GoogleChrome/chrome-extensions-samples](https://github.com/GoogleChrome/chrome-extensions-samples) MV3 conventions.

## Summary

The extension is structurally sound: correct MV3 patterns (state in `chrome.storage`, ephemeral service worker), no `eval` / `innerHTML` / `dangerouslySetInnerHTML` / remote scripts, the strict MV3 default CSP (no override), HTTPS default origin, and no `externally_connectable` (web pages cannot message the worker directly). The audit found seven issues concentrated around bearer-token handling, a globally-disabled CSRF check that also weakened the web app, and an untrusted page→extension input path. All have been remediated.

## Findings & Remediation

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **High** | **Token exfiltration via unvalidated `apiUrl`.** The popup let a user set any API base URL (`SET_API_URL`, `service-worker.ts`), and the session bearer token was attached to every request to it. A hostile or mistyped URL (including plaintext `http://…`) would send the token to an arbitrary origin. No scheme/host allow-list. | Added `extension/lib/apiUrl.ts` (`normalizeApiUrl`) allowing only `https://timetracker.run`, `https://*.workers.dev`, and `http://localhost[:port]`. Enforced in the `SET_API_URL` handler, re-validated on every read via `resolveBase()`, and validated in the popup before save with an inline error. |
| 2 | **High** | **`disableCSRFCheck: true` was global** on the Better Auth instance (`src/worker/auth.ts`), disabling origin/CSRF protection for the cookie-based **web app**, not just the extension. | Removed. Verified against better-auth's `origin-check` middleware: it early-returns when there is no `request` object, so a server-side `auth.api.signInEmail()` call is unaffected, while browser `/api/auth/*` requests are now validated against the configured `trustedOrigins`. Bearer-token API calls never touch `/api/auth/*`. See the follow-up migration below, which further replaces the custom endpoint with the standard client + a pinned `chrome-extension://` trusted origin. |
| 3 | **Medium** | **Untrusted page→extension timer spoofing.** The content script relayed any `timetracker:sync` `CustomEvent` to the worker with no origin/shape check. Because the script is also injected into GitHub/Jira/Linear (and previously Asana) for context detection, a hostile script on those pages could spoof timer state into extension storage. (A dispatched event's `isTrusted` is always `false`, so it can't be distinguished at the listener.) | The `timetracker:sync` relay is now registered **only on the app's own origins** (`localhost:5173`, `timetracker.run`) via a `window.location.origin` gate. The worker's `TIMER_STATE_CHANGED` handler also validates payload shape (`isValidTimerSync`) before writing. |
| 4 | **Medium** | **No 401/expiry/refresh handling.** A single bearer token was reused indefinitely; a 401 was swallowed, leaving stale state instead of forcing re-login. (Docs claimed "handles token refresh" — inaccurate.) | Added an `authedFetch` helper that centralizes the bearer header and, on 401, clears `authToken`/`timerState` and resets the badge. The popup's existing `chrome.storage.onChanged` listener then drops the UI back to the login form. CLAUDE.md corrected. |
| 5 | **Low** | **No `sender` validation** in the `onMessage` handler (defense-in-depth). | Handler now ignores any message where `sender.id !== chrome.runtime.id`. |
| 6 | **Low** | **`res.ok` not checked before `res.json()`** in `START_TIMER` / `STOP_TIMER`, so an error body could be persisted as `timerState`. | Added `res.ok` (and null-on-401) guards before parsing; failures respond `{ ok:false, error }` without persisting state. |
| 7 | **Low** | **Manifest hygiene:** unused `notifications` permission; `app.asana.com` matched with no `detectContext()` handler; `icon32.png` present but unreferenced. | Removed `notifications` permission and the Asana content-script match; referenced `icon32.png` in `action.default_icon` and `icons`. Left `https://*.workers.dev/*` in `host_permissions` (needed for preview deploys) — now safe given the apiUrl allow-list. |

## Not changed (reviewed, acceptable)

- **Token at rest in `chrome.storage.local`** (unencrypted). Standard for extensions; the token is a session bearer credential and is now only ever sent to allow-listed origins. Acceptable for MV3.
- **`https://*.workers.dev/*` host permission.** Broad but required for Cloudflare preview deploys; mitigated by the apiUrl allow-list.
- **Auth-endpoint rate limiting** (`middleware/rate-limit.ts`) is in-isolate only and bypassable across isolates. Out of scope for the extension audit; noted for the worker backlog (consider a Durable Object / KV-backed limiter for credential endpoints). Applies to the standard `/api/auth/sign-in/*` limiter now used by the extension.

## Follow-up: standard better-auth client (post-audit)

After the audit, the extension's auth was aligned with better-auth's [official browser-extension guidance](https://better-auth.com/docs/guides/browser-extension-guide): trust the extension by origin rather than special-casing it.

- **Removed the custom `/api/ext/sign-in` endpoint** (`src/worker/routes/auth.ts`, deleted) and its route/rate-limit registration in `src/worker/index.ts`.
- **Popup now uses the standard `createAuthClient`** (`extension/lib/auth-client.ts`): `signIn.email` / `getSession` / `signOut`. The `bearer()` plugin returns the token in the `set-auth-token` header; the client persists it to `chrome.storage.local` (shared with the service worker) and re-attaches it as `Authorization: Bearer`.
- **Trust is by pinned origin:** the extension ID is pinned via the manifest `key` (public key committed; private key in `extension/.keys/`, gitignored), and `chrome-extension://nogikmhdpnnedmfldanickgpikmifcje` is listed in `trustedOrigins` (`src/worker/auth.ts`). CSRF/origin checks remain on for the web app. This is strictly better than the audit's interim state: no bespoke sign-in endpoint, and the extension is authenticated by origin against the same `trustedOrigins` gate as the web app.
- All audit hardening (apiUrl allow-list, `authedFetch` + 401 handling, `res.ok` guards, `sender` check, content-script origin gate, manifest cleanup) is retained.

## Files touched

- `extension/lib/apiUrl.ts` (new) — API-URL allow-list.
- `extension/lib/auth-client.ts` (new) — standard better-auth client factory (bearer + chrome.storage).
- `extension/background/service-worker.ts` — `resolveBase`, `authedFetch` + 401 handling, `res.ok` guards, `sender` check, payload validation; `SIGN_IN` handler removed (popup owns sign-in).
- `extension/content/content-script.ts` — origin-gated sync relay.
- `extension/popup/Popup.tsx` — pre-save apiUrl validation + inline error; sign-in/session/sign-out via the standard client.
- `extension/manifest.json` — permission/match/icon cleanup; pinned `key`.
- `src/worker/auth.ts` — removed global `disableCSRFCheck`; added pinned `chrome-extension://` trusted origin.
- `src/worker/index.ts` — removed the `/api/ext/sign-in` route; `src/worker/routes/auth.ts` deleted.
- `CLAUDE.md` — corrected extension auth docs.
