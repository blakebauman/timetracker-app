import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// The timer bar used to switch to `md:flex-nowrap` while every control except
// the description input was `shrink-0`. Between 768px and ~1000px the row
// needed 680px in a 544–676px container, so the Stop button rendered past the
// viewport's right edge — and because `document.scrollWidth === clientWidth`,
// it was clipped rather than scrollable. A running timer could not be stopped
// from the bar on an iPad in portrait or a laptop at half width.
//
// The invariant this guards: every control in the timer bar is fully inside the
// viewport at every width, in both the idle and the running state.
const WIDTHS = [320, 390, 430, 600, 768, 820, 900, 1024, 1280, 1440];

async function boundsOf(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('header[aria-label="Timer"]') as HTMLElement;
    const vw = document.documentElement.clientWidth;
    return {
      vw,
      pageOverflows: document.documentElement.scrollWidth > vw + 1,
      barOverflows: bar.scrollWidth > bar.clientWidth + 1,
      controls: Array.from(bar.querySelectorAll("button, input")).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          name:
            el.getAttribute("aria-label") ||
            el.getAttribute("placeholder") ||
            (el as HTMLElement).innerText.slice(0, 24) ||
            el.tagName,
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
        };
      }),
    };
  });
}

test("every timer bar control stays on screen at every width", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  // A deliberately long project + task name: the overflow only showed up once
  // the chips were wide enough to matter.
  const created = await page.request.post("/api/projects", {
    data: { name: "Kearney ERP Migration Phase 2", color: "#e11d48", billable: true },
    headers: { origin },
  });
  const project = await created.json();
  await page.request.post("/api/tasks", {
    data: { name: "Stakeholder workshops", projectId: project.id },
    headers: { origin },
  });

  await page.goto("/");
  await page.waitForSelector('header[aria-label="Timer"]');
  await page.getByPlaceholder("What are you working on?").fill("Discovery workshop prep");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select project" }).click();
  await page.getByRole("option", { name: /Kearney/ }).click();
  await expect(page.getByRole("button", { name: /^Project:/ })).toBeVisible();
  await page.getByRole("button", { name: "Select task" }).click();
  await page.getByRole("option", { name: /Stakeholder/ }).click();
  await expect(page.getByRole("button", { name: /^Task:/ })).toBeVisible();

  for (const state of ["idle", "running"] as const) {
    if (state === "running") {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.getByRole("button", { name: "Start timer" }).click();
      await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
    }

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      // Let the wrap settle before measuring.
      await expect
        .poll(async () => (await boundsOf(page)).vw, { timeout: 2000 })
        .toBe(width);
      const { controls, barOverflows, pageOverflows } = await boundsOf(page);

      const offscreen = controls.filter((c) => c.right > width + 1 || c.left < -1);
      expect(
        offscreen,
        `${state} @ ${width}px: controls rendered outside the viewport`
      ).toEqual([]);

      expect(barOverflows, `${state} @ ${width}px: the bar clips its own content`).toBe(false);
      expect(pageOverflows, `${state} @ ${width}px: the page scrolls horizontally`).toBe(false);

      // A control the user can see but not read is only nominally on screen.
      // The description input is the one that used to collapse to 24px.
      const description = controls.find((c) => c.name === "What are you working on?");
      expect(
        description!.width,
        `${state} @ ${width}px: the description input collapsed to ${description!.width}px`
      ).toBeGreaterThan(120);
    }
  }
});
