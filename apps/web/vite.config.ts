import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // In CI there's no Cloudflare login, so the remote-only AI binding can't start
  // its proxy session and the dev server fails to boot. Disable remote bindings
  // in CI (no e2e test hits the AI endpoint); local dev keeps them for real use.
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ remoteBindings: !process.env.CI }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/react-app"),
    },
  },
  // Source maps for the WORKER only. wrangler.jsonc has upload_source_maps on,
  // but that only uploads a map that exists — and the Cloudflare plugin emits
  // one only when this environment asks for it, so until now every stack trace
  // in the observability logs was minified. The client build stays map-free on
  // purpose (nothing that ships to browsers should carry one; `pnpm check`
  // enforces it). The environment name is the worker name with `-` → `_`.
  environments: {
    timetracker_app: {
      build: { sourcemap: true },
    },
  },
});
