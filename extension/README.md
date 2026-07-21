# Time Tracker browser extension

A Manifest V3 Chrome extension that mirrors the [Time Tracker](https://timetracker.run)
web app: start/stop and view your running timer from the toolbar, with a live
badge, and pre-fill descriptions from issue/PR pages.

## Layout

```
extension/
├── manifest.json          # MV3 manifest (pinned "key" → stable ID for dev)
├── vite.config.ts         # standalone Vite build (separate from the web app)
├── background/
│   └── service-worker.ts  # timer polling, badge, message handlers, authedFetch
├── content/
│   └── content-script.ts  # timer sync relay (app origins only) + context detection
├── popup/                 # React popup: sign-in, start/stop, settings
│   ├── index.html · main.tsx · Popup.tsx
├── lib/
│   ├── auth-client.ts     # standard better-auth client (bearer + chrome.storage)
│   └── apiUrl.ts          # API base-URL allow-list
├── icons/                 # 16/32/48/128 px
└── .keys/                 # signing key (private key gitignored)
```

## How it works

- **Auth:** the popup uses better-auth's standard `createAuthClient`
  (`lib/auth-client.ts`). The server's `bearer()` plugin returns the session
  token in the `set-auth-token` header; the client stores it in
  `chrome.storage.local` and re-sends it as `Authorization: Bearer`. The
  background service worker reuses that token to poll the running timer and
  update the badge. On a `401` the worker clears the token and the popup returns
  to the login form. There is no refresh token.
- **Server trust:** the extension is trusted by its pinned origin
  (`chrome-extension://<id>`) in the worker's `trustedOrigins`
  (`src/worker/auth.ts`) — not by disabling CSRF.
- **API base URL:** configurable in the popup's settings but validated against an
  allow-list (`lib/apiUrl.ts`: `timetracker.run`, `*.workers.dev`,
  `localhost`/`127.0.0.1`) so the bearer token is never sent to an arbitrary
  origin.
- **Content script:** the `timetracker:sync` and `timetracker:assistant`
  (Aski nudge-dismissal) relays only run on the app's own origins; on
  GitHub/Jira/Linear it only reads the issue/PR title to pre-fill the
  description.

## Local development

The extension is built separately from the web app.

```bash
pnpm build:ext        # → dist/extension/
```

Then load it unpacked:

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `dist/extension/`.
3. Confirm the ID reads `nogikmhdpnnedmfldanickgpikmifcje` (pinned via the
   manifest `key`).
4. Run the app/API with `pnpm dev` (or point the popup's API URL at
   `https://timetracker.run`), then sign in from the popup.

Rebuild after changes with `pnpm build:ext` and hit **Reload** on the extension
card. There is no HMR for the extension build.

Useful scripts:

- `pnpm build:ext` — build to `dist/extension/`.
- `pnpm zip:ext` — build + package `dist/timetracker-extension.zip` for upload.
- `pnpm ext:id` — print the dev extension ID derived from the signing key.

## Publishing

See **[PUBLISHING.md](./PUBLISHING.md)** for the full Chrome Web Store flow,
including the extension-ID/`trustedOrigins` reconciliation you must do after the
first upload.

## Security

See **[SECURITY_AUDIT.md](./SECURITY_AUDIT.md)** for the security model, the
audit findings, and the remediations.
