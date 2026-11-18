import { defineConfig, devices } from "@playwright/test";

// E2E_PORT runs the suite against a dev server on another port when 5173 is
// taken (`E2E_PORT=5199 pnpm test:e2e`). Dev builds trust any
// http://localhost:<port> origin (worker/middleware/cors.ts), so sign-in, the
// sockets and the Assistant all work there. --strictPort makes a collision
// fail loudly instead of drifting to the next free port the URL below
// wouldn't follow.
const port = Number(process.env.E2E_PORT ?? 5173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
