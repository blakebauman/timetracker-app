import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

// Timer state is shared across a workspace's open tabs over the TimerRoom
// socket. The transport always worked; what didn't was the *receiving* side —
// only `timer:start`/`timer:stop` cleared the running timer, so the two stops
// that arrive as `entries:changed` (discard, and trimming idle time via a plain update)
// left every other tab counting an entry the server had already closed.
//
// A second page on the same browser context is a second tab: same cookies,
// same workspace, its own socket.

/** The second tab, signed into the same workspace and showing the timer bar. */
async function openSecondTab(page: Page) {
  const tab = await page.context().newPage();
  await tab.goto("/");
  await tab.waitForURL("/");
  return tab;
}

async function startTimer(page: Page, description: string) {
  await page.getByPlaceholder("What are you working on?").fill(description);
  await page.getByRole("button", { name: "Start timer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop timer", exact: true })).toBeVisible();
}

test.describe("cross-tab timer sync", () => {
  test("start and stop propagate to another tab", async ({ page }) => {
    await signUp(page);
    const tabB = await openSecondTab(page);

    await startTimer(page, "Cross-tab entry");

    // Tab B picks up the running timer over the socket.
    await expect(tabB.getByRole("button", { name: "Stop timer", exact: true })).toBeVisible();
    await expect(tabB.getByText("Cross-tab entry").first()).toBeVisible();

    await page.getByRole("button", { name: "Stop timer", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start timer", exact: true })).toBeVisible();

    // ...and lets it go again.
    await expect(tabB.getByRole("button", { name: "Start timer", exact: true })).toBeVisible();
  });

  // The regression: DELETE broadcasts `entries:changed` with a null payload,
  // which the handler used to ignore outright, so tab B kept ticking an entry
  // that no longer existed until someone reloaded it.
  test("discarding in one tab stops the timer in the other", async ({ page }) => {
    await signUp(page);
    const tabB = await openSecondTab(page);

    await startTimer(page, "Entry to discard");
    await expect(tabB.getByRole("button", { name: "Stop timer", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Discard timer" }).click();
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start timer", exact: true })).toBeVisible();

    await expect(tabB.getByRole("button", { name: "Start timer", exact: true })).toBeVisible();
  });

  // The socket used to invalidate `time-entries` and nothing else, while local
  // mutations also invalidated `reports`. So a stop in one tab never reached a
  // Reports view open in another — it sat on its old totals.
  test("stopping in one tab refreshes Reports in the other", async ({ page }) => {
    await signUp(page);
    const tabB = await openSecondTab(page);

    await tabB.goto("/reports");
    // The stat tile's value is the <p> alongside its "Entries" label. Scoped to
    // <main> because the command palette carries the same word.
    const entriesCount = tabB
      .locator("main")
      .getByText("Entries", { exact: true })
      .locator("xpath=../../p");
    await expect(entriesCount).toHaveText("0");

    await startTimer(page, "Entry for reports");
    await page.getByRole("button", { name: "Stop timer", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start timer", exact: true })).toBeVisible();

    // No reload, no tab switch — the socket has to carry it.
    await expect(entriesCount).toHaveText("1");
  });

  // The other regression: a stop applied through the ordinary update route
  // (trimming idle time, or the edit sheet) broadcasts `entries:changed`
  // carrying the now-stopped entry. `setFromWS` didn't look at `stop`, so tab B
  // stored a closed entry as the running one and counted it forever.
  test("a stop applied via the update route clears the other tab's timer", async ({
    page,
  }) => {
    await signUp(page);
    const tabB = await openSecondTab(page);

    await startTimer(page, "Entry closed by update");
    await expect(tabB.getByRole("button", { name: "Stop timer", exact: true })).toBeVisible();

    // Close the entry the way idle-trim does — a plain update carrying a `stop`,
    // not the dedicated /stop route — from a third client so neither tab's own
    // mutation masks the socket path under test.
    const origin = new URL(page.url()).origin;
    const current = await (
      await page.request.get("/api/time_entries/current", { headers: { origin } })
    ).json();
    expect(current?.id).toBeTruthy();
    const res = await page.request.put(`/api/time_entries/${current.id}`, {
      data: { stop: new Date().toISOString() },
      headers: { origin },
    });
    expect(res.ok(), `${res.status()} ${await res.text()}`).toBeTruthy();

    await expect(tabB.getByRole("button", { name: "Start timer", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start timer", exact: true })).toBeVisible();
  });
});
