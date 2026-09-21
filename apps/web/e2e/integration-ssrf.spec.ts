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

// The guard holds after the URL check too: adapters fetch with redirects
// disabled, so a validated host cannot 3xx the worker somewhere else. Pure
// function — exercised directly with a stubbed fetch.
import { guardedFetch, upstreamErrorMessage } from "../src/worker/integrations/url-guard";

test.describe("integration outbound fetch", () => {
  test("a redirecting upstream is refused, not followed", async () => {
    const realFetch = globalThis.fetch;
    const seen: RequestInit[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seen.push(init ?? {});
      return new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/" } });
    }) as typeof fetch;
    try {
      await expect(guardedFetch("https://acme.my.workfront.com/attask/api")).rejects.toThrow(
        /redirects are not followed/,
      );
      expect(seen[0]?.redirect).toBe("manual");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("an upstream error surfaces its structured message, never its raw body", async () => {
    const structured = new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
      status: 401,
      statusText: "Unauthorized",
    });
    expect(await upstreamErrorMessage(structured, "workfront")).toBe("Invalid API key");

    const raw = new Response("<html>SECRET-INTERNAL-PAGE</html>", { status: 500, statusText: "Boom" });
    const msg = await upstreamErrorMessage(raw, "workfront");
    expect(msg).toBe("HTTP 500 Boom");
    expect(msg).not.toContain("SECRET");
  });
});
