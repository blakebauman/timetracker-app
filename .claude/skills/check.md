---
name: check
description: Run the full project validation suite (typecheck + build + wrangler dry-run) and report any errors with suggested fixes.
---

Run the full project validation suite:

```bash
pnpm check
```

This runs: TypeScript typecheck → Vite production build → `wrangler deploy --dry-run`.

- If it passes, confirm clean and move on.
- If it fails, read the error output carefully and fix the root cause. Do not suppress errors with `// @ts-ignore` or type casts unless there is no other option.
- For type errors: find the source of the mismatch (check `src/shared/schemas.ts` for Zod-derived types first).
- For build errors: check Vite/Rollup output for the specific module that failed.
- For wrangler dry-run errors: usually a binding or `wrangler.jsonc` issue — run `pnpm cf-typegen` if bindings changed.
