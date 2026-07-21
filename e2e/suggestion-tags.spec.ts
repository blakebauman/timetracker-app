import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

// Seed a project + two completed entries sharing a description but with
// different tags (older vs newer), so the suggestion should carry the NEWER
// entry's tags.
async function seed(page: Page) {
  const proj = await page.request.post("/api/projects", {
    data: { name: "Alpha", color: "#e11d48" },
  });
  const { id: projectId } = (await proj.json()) as { id: string };
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  // Older entry: tag that must NOT carry over.
  await page.request.post("/api/time_entries", {
    data: {
      description: "Recurring standup",
      projectId,
      start: iso(3 * 3600_000),
      stop: iso(3 * 3600_000 - 15 * 60_000),
      tags: ["old-tag"],
    },
  });
  // Newer entry: these tags should carry over.
  await page.request.post("/api/time_entries", {
    data: {
      description: "Recurring standup",
      projectId,
      start: iso(1 * 3600_000),
      stop: iso(1 * 3600_000 - 15 * 60_000),
      tags: ["meeting", "internal"],
    },
  });
  // Fresh load so the suggestions query refetches post-seed.
  await page.reload();
}

test("timer bar: suggestion carries newest tags as removable chips", async ({ page }) => {
  await signUp(page);
  await seed(page);

  const desc = page.getByPlaceholder("What are you working on?");
  await desc.click();
  await desc.fill("Recur");

  const option = page.getByRole("option", { name: /Recurring standup/ });
  await expect(option).toBeVisible();
  // Row previews the newer entry's tags, not the older one's.
  await expect(option).toContainText("meeting");
  await expect(option).toContainText("internal");
  await expect(option).not.toContainText("old-tag");

  await option.click();

  // Chips render in the bar, removable.
  await expect(page.getByRole("button", { name: "Remove tag meeting" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove tag internal" })).toBeVisible();
  // Project carried over too (existing behaviour intact).
  await expect(page.getByRole("button", { name: /^Project: Alpha/ })).toBeVisible();

  // Start, then remove a chip while running — the running entry must update.
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.getByRole("button", { name: "Remove tag meeting" }).click();
  await expect(page.getByRole("button", { name: "Remove tag meeting" })).toBeHidden();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();

  // The stopped entry keeps the remaining tag only.
  const res = await page.request.get("/api/time_entries");
  const entries = (await res.json()) as { description: string; tags: string[]; stop: string | null }[];
  const stopped = entries.find(
    (e) => e.description === "Recurring standup" && e.stop && e.tags.length === 1
  );
  expect(stopped?.tags).toEqual(["internal"]);
});

test("add-entry form: suggestion fills TagPicker with carried tags", async ({ page }) => {
  await signUp(page);
  await seed(page);

  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog");
  const desc = dialog.locator("textarea");
  await desc.click();
  await desc.fill("Recur");

  const option = page.getByRole("option", { name: /Recurring standup/ });
  await expect(option).toBeVisible();
  await option.click();

  // Description replaced, tags landed in the TagPicker, project carried over.
  await expect(desc).toHaveValue("Recurring standup");
  // GROUP_CONCAT gives no order guarantee — accept either tag order.
  await expect(
    dialog.getByRole("button", {
      name: /^Tags: (meeting, internal|internal, meeting)$/,
    })
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Project: Alpha/ })).toBeVisible();
});
