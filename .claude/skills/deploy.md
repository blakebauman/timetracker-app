---
name: deploy
description: Deploy the time-tracker app to Cloudflare Workers production. Runs validation first, then confirms with the user before deploying.
---

Deploy the time-tracker app to production at `timetracker.blakebauman.dev`.

Steps:
1. Run `pnpm check` to validate the build. Fix any errors before proceeding.
2. Ask the user to confirm they want to deploy to production.
3. If confirmed, run:
   ```bash
   pnpm deploy
   ```
4. Report the deployed worker URL and any output from wrangler.

Reminders:
- If you added a new D1 migration, it must be applied to prod separately:
  ```bash
  npx wrangler d1 migrations apply DB --remote
  ```
- If you changed bindings in `wrangler.jsonc`, run `pnpm cf-typegen` first.
- If you changed Durable Object classes, ensure the `migrations` array in `wrangler.jsonc` is updated.
