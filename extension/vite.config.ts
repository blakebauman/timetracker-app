import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Separate Vite build for the Chrome extension (MV3)
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../dist/extension",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup/index.html"),
        "background/service-worker": resolve(
          __dirname,
          "background/service-worker.ts"
        ),
        "content/content-script": resolve(
          __dirname,
          "content/content-script.ts"
        ),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "../src/react-app"),
    },
  },
});
