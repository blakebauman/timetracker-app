import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// `billable` is the only column reports read to compute billable hours and
// invoiced amount, and nothing derives it from the project at read time. The
// timer bar had no billable control and `handleStart` sent no flag, so every
// timer started here was written `billable = 0` — a workspace could track a full
// week against a billable retainer and report zero revenue.
test.describe("billable time survives the timer bar", () => {
  test("a timer on a billable project starts billable, and the toggle overrides it", async ({
    page,
  }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    const billableProject = await (
      await page.request.post("/api/projects", {
        data: { name: "Retainer", color: "#e11d48", billable: true },
        headers: { origin },
      })
    ).json();
    await page.request.post("/api/projects", {
      data: { name: "Internal", color: "#2563eb", billable: false },
      headers: { origin },
    });

    await page.goto("/");
    await page.waitForSelector('header[aria-label="Timer"]');

    // Nothing picked yet: non-billable, and the control says so.
    const toggle = page.getByRole("button", { name: "Billable", exact: true });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    // Picking a billable project answers the question for the user.
    await page.getByRole("button", { name: "Select project" }).click();
    await page.getByRole("option", { name: /Retainer/ }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await page.getByPlaceholder("What are you working on?").fill("Discovery call");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Start timer" }).click();
    await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();

    await expect
      .poll(async () => {
        const running = await (
          await page.request.get("/api/time_entries?running=true", { headers: { origin } })
        ).json();
        return running[0]?.billable;
      })
      .toBe(true);

    // An explicit toggle beats the project's default, on the live entry.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => {
        const running = await (
          await page.request.get("/api/time_entries?running=true", { headers: { origin } })
        ).json();
        return running[0]?.billable;
      })
      .toBe(false);

    // Switching to a non-billable project re-seeds from that project.
    await page.getByRole("button", { name: /^Project:/ }).click();
    await page.getByRole("option", { name: /Internal/ }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: /^Project:/ }).click();
    await page.getByRole("option", { name: /Retainer/ }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    expect(billableProject.billable).toBe(true);
  });

  test("an entry created without a billable flag inherits the project's", async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    const project = await (
      await page.request.post("/api/projects", {
        data: { name: "Retainer", color: "#e11d48", billable: true },
        headers: { origin },
      })
    ).json();

    // The extension, the AI quick-add and any API caller take this path.
    const omitted = await (
      await page.request.post("/api/time_entries", {
        data: {
          description: "No flag sent",
          projectId: project.id,
          start: new Date(Date.now() - 3600_000).toISOString(),
          stop: new Date(Date.now() - 1800_000).toISOString(),
        },
        headers: { origin },
      })
    ).json();
    expect(omitted.billable).toBe(true);

    // An explicit false still wins — inheritance only fills the gap.
    const explicit = await (
      await page.request.post("/api/time_entries", {
        data: {
          description: "Explicit false",
          projectId: project.id,
          billable: false,
          start: new Date(Date.now() - 7200_000).toISOString(),
          stop: new Date(Date.now() - 5400_000).toISOString(),
        },
        headers: { origin },
      })
    ).json();
    expect(explicit.billable).toBe(false);

    // No project, no flag: nothing to inherit from.
    const orphan = await (
      await page.request.post("/api/time_entries", {
        data: {
          description: "No project",
          start: new Date(Date.now() - 10800_000).toISOString(),
          stop: new Date(Date.now() - 9000_000).toISOString(),
        },
        headers: { origin },
      })
    ).json();
    expect(orphan.billable).toBe(false);
  });
});

// Settings → Preferences → "Default billable" wrote to localStorage and was
// read by nothing: the switch was inert and the user guide documented a
// preference that never affected a single entry.
test("the Default billable preference actually applies", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  await page.request.post("/api/projects", {
    data: { name: "Internal", color: "#2563eb", billable: false },
    headers: { origin },
  });

  await page.goto("/settings?tab=general");
  await page.getByLabel("Default billable").click();
  await expect(page.getByLabel("Default billable")).toBeChecked();

  await page.goto("/");
  await page.waitForSelector('header[aria-label="Timer"]');
  const toggle = page.getByRole("button", { name: "Billable", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // A project that says non-billable still wins over the preference…
  await page.getByRole("button", { name: "Select project" }).click();
  await page.getByRole("option", { name: /Internal/ }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  // …and clearing the project falls back to the preference, not to false.
  await page.getByRole("button", { name: /^Project:/ }).click();
  await page.getByRole("option", { name: "No project" }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});
