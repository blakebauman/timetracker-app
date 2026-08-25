import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

/**
 * Calendar sync is provider-agnostic: Google and Outlook are two rows of the
 * same feature, and a workspace may hold both at once.
 *
 * These assert the parts that don't need a real OAuth app — the shape the
 * Settings card renders from, and the guards on the connect/callback pair.
 */
test.describe("calendar providers", () => {
  test("status lists every provider the server knows about", async ({ page }) => {
    await signUp(page);
    const status = (await (await page.request.get("/api/calendar/status")).json()) as {
      provider: string;
      label: string;
      configured: boolean;
      connected: boolean;
      autoTrack: boolean;
    }[];

    expect(status.map((s) => s.provider).sort()).toEqual(["google", "microsoft"]);
    for (const row of status) {
      expect(row.label).toBeTruthy();
      // A fresh workspace has connected nothing, whatever the server supports.
      expect(row.connected).toBe(false);
      expect(row.autoTrack).toBe(false);
    }
  });

  test("an unknown provider is refused rather than guessed at", async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;

    const connect = await page.request.get("/api/calendar/bogus/connect", {
      maxRedirects: 0,
    });
    expect(connect.status()).toBe(302);
    expect(connect.headers()["location"]).toContain("calendar=error");

    const remove = await page.request.delete("/api/calendar/bogus", {
      headers: { origin },
    });
    expect(remove.status()).toBe(404);
  });

  test("a callback will not accept another provider's state", async ({ page }) => {
    await signUp(page);

    // Begin a flow for whichever provider this server has configured.
    const status = (await (await page.request.get("/api/calendar/status")).json()) as {
      provider: string;
      configured: boolean;
    }[];
    const configured = status.find((s) => s.configured);
    test.skip(!configured, "No calendar provider configured on this server");

    const begun = await page.request.get(
      `/api/calendar/${configured!.provider}/connect`,
      { maxRedirects: 0 }
    );
    expect(begun.status()).toBe(302);
    const state = new URL(begun.headers()["location"]).searchParams.get("state");
    expect(state).toBeTruthy();

    // Replaying that state at the OTHER provider's callback must be refused —
    // the state cookie binds the provider as well as the workspace.
    const other = configured!.provider === "google" ? "microsoft" : "google";
    const replayed = await page.request.get(
      `/api/calendar/${other}/callback?code=fake&state=${state}`,
      { maxRedirects: 0 }
    );
    expect(replayed.status()).toBe(302);
    expect(replayed.headers()["location"]).toContain("calendar=error");
  });
});
