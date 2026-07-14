import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

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
      "@": path.resolve(__dirname, "./src/react-app"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
});
