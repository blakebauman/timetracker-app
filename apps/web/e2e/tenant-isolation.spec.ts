import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// Regression coverage for the Phase 1 cross-tenant (IDOR) hardening: a caller in
// workspace B must never be able to read or mutate a resource owned by workspace
// A by referencing its id. Each browser context has its own cookie jar, so the
// two pages act as two independent authenticated workspaces.
test.describe("cross-tenant isolation (IDOR)", () => {
  test("workspace B cannot read or mutate workspace A's resources by id", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signUp(pageA);

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signUp(pageB);

    // ── A creates a client holding private contact PII ──────────────────────
    const clientRes = await pageA.request.post("/api/clients", {
      data: { name: "Victim Client", email: "secret@victim.test", phone: "555-0100" },
    });
    expect(clientRes.ok()).toBeTruthy();
    const victimClient = await clientRes.json();

    // B attempts a no-op PUT to read A's client back through the response body.
    const clientLeak = await pageB.request.put(`/api/clients/${victimClient.id}`, { data: {} });
    expect(clientLeak.status()).toBe(404);
    expect(await clientLeak.text()).not.toContain("secret@victim.test");

    // ── A creates a time entry with a private tag ───────────────────────────
    const entryRes = await pageA.request.post("/api/time_entries", {
      data: {
        description: "Billable work",
        start: "2026-05-01T09:00:00.000Z",
        stop: "2026-05-01T10:00:00.000Z",
        billable: true,
        tags: ["confidential"],
      },
    });
    expect(entryRes.ok()).toBeTruthy();
    const victimEntry = await entryRes.json();
    expect(victimEntry.tags).toEqual(["confidential"]);

    // B attempts a tags-only PUT to wipe A's tags (the join-table write path).
    const tagWipe = await pageB.request.put(`/api/time_entries/${victimEntry.id}`, {
      data: { tags: [] },
    });
    expect(tagWipe.status()).toBe(404);

    // B attempts the same via the bulk endpoint (returns ok, but must no-op on
    // foreign ids).
    const bulkWipe = await pageB.request.patch("/api/time_entries/bulk", {
      data: { ids: [victimEntry.id], patch: { tags: [] } },
    });
    expect(bulkWipe.ok()).toBeTruthy();

    // A re-reads its entry: the tag must survive both attempts.
    const reread = await pageA.request.get(`/api/time_entries/${victimEntry.id}`);
    expect(reread.ok()).toBeTruthy();
    expect((await reread.json()).tags).toEqual(["confidential"]);

    await ctxA.close();
    await ctxB.close();
  });
});
