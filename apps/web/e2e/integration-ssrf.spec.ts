import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// Regression coverage for the Phase 4 SSRF guard: a push integration's base_url
// is fetched server-side, so internal/loopback/non-https hosts (and, for
// Dynamics, non-*.dynamics.com hosts) must be rejected at creation.
test.describe("integration base URL SSRF guard", () => {
  test("rejects unsafe base URLs and accepts a valid public host", async ({ page }) => {
    await signUp(page);

    const create = (body: unknown) =>
      page.request.post("/api/integrations", { data: body });

    // Loopback / non-https → rejected.
    const localhost = await create({
      type: "workfront",
      name: "evil",
      baseUrl: "http://localhost/attask",
      credentials: { apiKey: "k" },
    });
    expect(localhost.status()).toBe(400);

    // Cloud metadata / link-local IP → rejected.
    const metadata = await create({
      type: "workfront",
      name: "evil2",
      baseUrl: "https://169.254.169.254",
      credentials: { apiKey: "k" },
    });
    expect(metadata.status()).toBe(400);

    // Dynamics pinned to *.dynamics.com → a foreign host is rejected.
    const fakeDynamics = await create({
      type: "dynamics",
      name: "evil3",
      baseUrl: "https://attacker.example.com",
      credentials: { tenantId: "t", clientId: "c", clientSecret: "s" },
    });
    expect(fakeDynamics.status()).toBe(400);

    // A legitimate public Workfront host is accepted.
    const ok = await create({
      type: "workfront",
      name: "Acme Workfront",
      baseUrl: "https://acme.my.workfront.com",
      credentials: { apiKey: "k" },
    });
    expect(ok.status()).toBe(201);
  });
});
