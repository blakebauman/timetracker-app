# Privacy Policy — Time Tracker browser extension

> **Draft template.** Review with your own legal counsel, fill the
> `<PLACEHOLDERS>`, and host the final version at a public URL (e.g.
> `https://timetracker.run/privacy`). The Chrome Web Store listing must link to
> that URL. Keep the "Last updated" date current.

**Last updated:** `<DATE>`

The Time Tracker browser extension ("the extension") is published by
`<LEGAL ENTITY / DEVELOPER NAME>` ("we", "us"). This policy explains what the
extension accesses, why, and how it is handled.

## What the extension accesses

- **Account credentials.** When you sign in through the popup, your email and
  password are sent directly to the Time Tracker API (`https://timetracker.run`
  or a URL you configure) to authenticate you. The extension does **not** store
  your password.
- **Session token.** On successful sign-in, a session (bearer) token is stored
  locally in the browser (`chrome.storage.local`) and sent with API requests to
  keep you signed in. It is removed on sign-out or when it expires.
- **Timer data.** The description, project, and start/stop times of the timer you
  start or view, exchanged with the Time Tracker API.
- **Page context (titles only).** On `github.com`, `*.atlassian.net`, and
  `linear.app`, the extension reads the current issue/PR/ticket **title** to
  pre-fill the timer description. It does not read page content otherwise and
  runs no code on other sites.

## How it is used

Solely to operate the timer on your behalf: authenticate you, show and control
your running timer, and pre-fill descriptions. We do **not** sell your data, use
it for advertising, or share it with third parties beyond the Time Tracker
backend that provides the service.

## Storage and retention

Credentials are never persisted by the extension. The session token and cached
timer state live in local browser storage until sign-out, expiry, or extension
removal. Timer data is retained by the Time Tracker service per its own policy.

## Permissions

- `storage` — cache the session token and timer state locally.
- `alarms` — periodically refresh the timer and update the toolbar badge.
- Host access to `timetracker.run` / `*.workers.dev` / `localhost` — call the
  Time Tracker API you are signed in to.
- Content-script access to `github.com` / `*.atlassian.net` / `linear.app` —
  read the current issue/PR title to pre-fill the description.

## Your choices

Sign out from the popup to clear the stored token, or remove the extension to
delete all locally stored data. Manage your account and data in the Time Tracker
web app.

## Contact

Questions: `<SUPPORT EMAIL>`.
