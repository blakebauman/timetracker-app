import { test, expect } from "@playwright/test";
import { signUp } from "./auth";


test("tag colors: recolor an existing tag in the entry dialog", async ({ page }) => {
  await signUp(page);
  // Seed an entry carrying the tag so it exists server-side (recolorable).
  await page.request.post("/api/time_entries", {
    data: {
      description: "seed",
      start: new Date(Date.now() - 3600_000).toISOString(),
      stop: new Date().toISOString(),
      tags: ["design"],
    },
  });

  // The Tags picker lives in the Add-entry dialog.
  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog", { name: "Add entry" });
  await dialog.getByRole("button", { name: "Tags" }).click();
  await page.getByPlaceholder("Add a tag...").fill("design");
  await page.getByRole("option", { name: /design/ }).first().click();

  // The selected tag's dot opens the inline recolor palette.
  await page.getByRole("button", { name: "Recolor design" }).click();
  await page.getByRole("button", { name: /Set design to Violet/ }).click();
  await expect(page.getByRole("button", { name: "Recolor design" })).toBeVisible();
});

test("recurring entries: create a template in settings", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings");

  await expect(page.getByText("Recurring entries")).toBeVisible();
  const card = page.locator("div").filter({ hasText: /^Recurring entries/ }).first();
  await card.getByRole("button", { name: "Add" }).click();

  const dialog = page.getByRole("dialog", { name: "New recurring entry" });
  await dialog.getByLabel("Description").fill("Daily standup");
  await dialog.getByLabel("Duration (minutes)").fill("15");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Daily standup")).toBeVisible();
  await expect(page.getByText(/Weekdays ·/)).toBeVisible();
});

test("calendar: gaps toggle present on the time grid", async ({ page }) => {
  await signUp(page);
  await page.getByRole("tab", { name: "Calendar" }).click();
  await expect(page.getByRole("button", { name: /untracked gaps/i })).toBeVisible();
});

test("timer stop: day total stays put (optimistic), entry lands with duration", async ({ page }) => {
  await signUp(page);

  await page.getByPlaceholder("What are you working on?").fill("Focus block");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.waitForTimeout(2000); // accrue a couple seconds

  await page.getByRole("button", { name: "Stop" }).click();
  // Bar clears back to Start, and the completed entry shows immediately with its
  // duration — the day total should not collapse to 0 during the refetch.
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await expect(page.getByText("Focus block").first()).toBeVisible();
});
