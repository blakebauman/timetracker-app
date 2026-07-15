# Publishing the Time Tracker extension to the Chrome Web Store

This is the end-to-end guide for shipping `extension/` to the Chrome Web Store
(CWS) and how users install it. Read the **Extension ID** section carefully —
it interacts with the server's `trustedOrigins` and, if skipped, the published
extension will fail to sign in with a `403`.

## 0. One-time setup

1. **Register a Chrome Web Store developer account** at
   <https://chrome.google.com/webstore/devconsole> — a **one-time US$5** fee,
   paid with a Google account. Verify your email; publishing as a business may
   require additional identity verification.
2. **Host a privacy policy.** Because this extension handles authentication data
   (email/password → session token), CWS **requires** a privacy policy URL.
   Use `extension/PRIVACY.md` as the starting draft, host it at a public URL
   (e.g. `https://timetracker.run/privacy`), and link it in the listing.

## 1. Build the package

```bash
pnpm zip:ext
```

This runs `build:ext` and writes **`dist/timetracker-extension.zip`** with the
manifest at the archive root (CWS requires the manifest at the top level, not
inside a subfolder). The zip contains only built assets + `manifest.json` +
`icons/` — never the signing key (`extension/.keys/` is outside `dist/`).

Before zipping, bump `"version"` in `extension/manifest.json` for every new
upload (CWS rejects a re-upload with an unchanged or lower version). Use
`major.minor.patch`, increasing.

## 2. Extension ID — the important part

The extension ID is a hash of a public key. There are **two** keys in play:

- **Local dev key** (`extension/.keys/extension.pem`) → ID
  `nogikmhdpnnedmfldanickgpikmifcje`, pinned via `manifest.json` `"key"`. This
  keeps the *unpacked* dev build's ID stable so `trustedOrigins` works locally.
- **The Chrome Web Store's key** → the **published** ID, which CWS assigns on the
  first upload. **This is different from the dev ID** and is what real users get.

The server (`src/worker/auth.ts` → `trustedOrigins`) only trusts the origins
listed there. So after the first upload you must reconcile the IDs:

1. Upload the zip once (step 3) to create the item — you don't have to publish it
   yet.
2. In the dashboard, open the item → **Package** → **View public key**.
3. **Recommended (single ID everywhere):** copy that key (the base64 between the
   `BEGIN/END PUBLIC KEY` lines, newlines removed) into `manifest.json` `"key"`,
   replacing the dev bootstrap key. Then re-derive the ID and update
   `trustedOrigins`:
   ```bash
   # after pasting the CWS key into manifest.json, compute its id:
   echo 'PASTE_THE_CWS_KEY' | base64 -d | openssl dgst -sha256 -binary \
     | xxd -p -c 32 | head -c 32 | tr '0-9a-f' 'a-p'; echo
   ```
   Put `chrome-extension://<that-id>` in `src/worker/auth.ts` `trustedOrigins`,
   deploy the worker (`pnpm run deploy`), then rebuild + re-zip + re-upload the
   extension. Now local dev and production share one ID.
4. **Alternative (keep separate dev/prod IDs):** leave the dev key as-is and just
   **add** the CWS-assigned `chrome-extension://<published-id>` as a second entry
   in `trustedOrigins` alongside the dev one, then `pnpm run deploy`.

> The published `host_permissions` already cover `https://timetracker.run/*`, so
> no host-permission change is needed for production.

## 3. Upload & fill the listing

In the [developer dashboard](https://chrome.google.com/webstore/devconsole):

1. **Add new item** → upload `dist/timetracker-extension.zip`.
2. **Store listing** tab:
   - Detailed description, category (**Productivity**), primary language.
   - **Icon:** 128×128 (already in `icons/icon128.png`).
   - **Screenshots:** at least one, **1280×800** or 640×400 PNG/JPG.
   - Optional promo tiles: small **440×280**, marquee **1400×560**.
3. **Privacy** tab:
   - **Single purpose:** "Start/stop and view your Time Tracker timer from the
     browser toolbar, and pre-fill descriptions from issue/PR pages."
   - **Permission justifications:**
     - `storage` — cache the session token and running-timer state locally.
     - `alarms` — periodically refresh the timer and update the toolbar badge.
     - `host_permissions` (`timetracker.run`, `*.workers.dev`, `localhost`) —
       call the Time Tracker API the user is signed in to.
     - content-script hosts (`github.com`, `*.atlassian.net`, `linear.app`) —
       read the current issue/PR title to pre-fill the timer description.
   - **Data usage:** discloses that authentication info (email, password entered
     in the popup) and the session token are handled; not sold; used only to
     operate the timer. Link the privacy policy URL.
4. **Distribution** tab: visibility — **Public**, **Unlisted**, or **Private**
   (specific trusted testers / your Google Workspace org). Set regions.

## 4. Submit for review & publish

- Click **Submit for review**. Reviews for a simple MV3 extension usually land in
  a few hours to a few days.
- You can choose **deferred publishing** to release manually after approval. A
  staged submission reverts to draft if not published within ~30 days.

## 5. How users install it

- **Public/Unlisted:** share the store URL
  `https://chromewebstore.google.com/detail/<published-id>` (unlisted items don't
  appear in search but anyone with the link can install). Users click **Add to
  Chrome** → **Add extension**, then pin it from the puzzle-piece menu.
- **Private:** only allowlisted tester accounts (or your Workspace org) can see
  and install it.

## 6. Publishing updates

1. Bump `"version"` in `manifest.json`.
2. `pnpm zip:ext`.
3. Dashboard → the item → **Package** → upload the new zip → **Submit for
   review**. Installed users auto-update within a few hours of approval.

## Related

- `extension/README.md` — architecture, local dev, load-unpacked.
- `extension/SECURITY_AUDIT.md` — security model and hardening.
- `extension/.keys/README.md` — signing key handling.
