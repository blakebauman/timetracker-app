import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

// The two latin faces every page renders on first paint (UI text and the
// timer's mono digits). Fontsource's CSS is bundled, so the browser only
// discovers them after the stylesheet has downloaded and parsed; a preload in
// the HTML starts them alongside it.
const PRELOAD_FONTS = /^assets\/geist(-mono)?-latin-wght-normal-[\w-]+\.woff2$/;

function preloadFonts(): Plugin {
  return {
    name: "timetracker:preload-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        return Object.keys(ctx.bundle ?? {})
          .filter((file) => PRELOAD_FONTS.test(file))
          .map((file) => ({
            tag: "link",
            attrs: { rel: "preload", href: `/${file}`, as: "font", type: "font/woff2", crossorigin: "" },
            injectTo: "head" as const,
          }));
      },
    },
  };
}

export default defineConfig({
  // In CI there's no Cloudflare login, so the remote-only AI binding can't start
  // its proxy session and the dev server fails to boot. Disable remote bindings
  // in CI (no e2e test hits the AI endpoint); local dev keeps them for real use.
  plugins: [
    react(),
    tailwindcss(),
    preloadFonts(),
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
    // React and the router change on a dependency bump, not on a deploy. Left
    // in the app entry they were re-downloaded after every release; in their
    // own chunk the immutable /assets/* cache keeps them across deploys.
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                {
                  name: "react-vendor",
                  test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
                },
              ],
            },
          },
        },
      },
    },
  },
});
