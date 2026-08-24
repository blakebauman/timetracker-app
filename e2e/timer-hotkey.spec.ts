import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// Alt+Shift+S is advertised in the Start button's own tooltip, but it used to be
// two different actions from one label:
//   • inert in the description field, because react-hotkeys-hook skips form tags
//     by default — and that field is where the user is every time they are about
//     to start a timer;
//   • when it did fire, `startTimer()` was called with no arguments, so it began
//     a blank, project-less, non-billable entry and the running-entry sync then
//     wiped the typed description and picked project off the screen.
test("Alt+Shift+S starts the staged draft, from inside the description field", async ({
  page,
}) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  await page.request.post("/api/projects", {
    data: { name: "Retainer", color: "#e11d48", billable: true },
    headers: { origin },
  });

  await page.goto("/");
  await page.waitForSelector('header[aria-label="Timer"]');

  const input = page.getByPlaceholder("What are you working on?");
  await input.fill("Client call — Q3 scoping");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select project" }).click();
  await page.getByRole("option", { name: /Retainer/ }).click();
  await expect(page.getByRole("button", { name: /^Project:/ })).toBeVisible();

  // Focus stays in the description field, exactly as it would in real use.
  await input.click();
  await page.keyboard.press("Alt+Shift+S");

  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
  // The staged draft is what got committed — not wiped, not replaced by a blank.
  await expect(input).toHaveValue("Client call — Q3 scoping");
  await expect(page.getByRole("button", { name: /^Project:/ })).toBeVisible();

  // The Stop button flips optimistically, before the create round-trips — poll
  // rather than reading once, or this races the server on a loaded machine.
  await expect
    .poll(async () => {
      const running = await (
        await page.request.get("/api/time_entries?running=true", { headers: { origin } })
      ).json();
      const entry = running[0];
      return entry && {
        description: entry.description,
        projectName: entry.projectName,
        billable: entry.billable,
      };
    })
    .toEqual({
      description: "Client call — Q3 scoping",
      projectName: "Retainer",
      billable: true,
    });

  // And it still stops from the same field.
  await input.click();
  await page.keyboard.press("Alt+Shift+S");
  await expect(page.getByRole("button", { name: "Start timer" })).toBeVisible();
});
