import { test, expect } from "@playwright/test";
import { PROJECT_COLORS } from "../src/react-app/lib/colorUtils";

/**
 * Contrast regression guard.
 *
 * Project/tag colors are arbitrary palette hexes, so any label drawn on a tint
 * of its own swatch has to derive its foreground rather than copy it. Before
 * `.tt-swatch-tint`, `ProjectBadge` set `color` to the raw hex and every project
 * failed WCAG AA in light mode (amber bottomed out at 1.88:1).
 *
 * This asserts the derived color clears AA for EVERY palette entry, in BOTH
 * themes, over EVERY surface a tinted label sits on — so adding a color to the
 * palette or retuning the neutral ramp can't silently regress legibility.
 *
 * Ratios are measured through the browser's own color engine (getComputedStyle
 * resolves color-mix/oklch, then a 1×1 canvas read-back gives real sRGB), because
 * hand-rolled oklch parsing silently produces garbage.
 */

const AA_NORMAL = 4.5;
// The two alphas a swatch tint is painted at: 0x22 (badge) and 0.16 (calendar event).
const TINT_ALPHAS = [0x22 / 255, 0.16];
const SURFACES = ["--background", "--card", "--muted", "--accent"];

test("swatch labels clear WCAG AA on every palette color, theme, and surface", async ({
  page,
}) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  const failures = await page.evaluate(
    ({ palette, alphas, surfaceTokens, threshold }) => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;

      type RGBA = [number, number, number, number];
      const resolve = (css: string): RGBA => {
        probe.style.color = "";
        probe.style.color = css;
        const r = getComputedStyle(probe).color;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = r;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      };
      const over = (f: RGBA, b: RGBA): RGBA => [
        f[0] * f[3] + b[0] * (1 - f[3]),
        f[1] * f[3] + b[1] * (1 - f[3]),
        f[2] * f[3] + b[2] * (1 - f[3]),
        1,
      ];
      const lum = (c: RGBA) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const ratio = (a: RGBA, b: RGBA) => {
        const l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const tok = (n: string) =>
        getComputedStyle(document.documentElement).getPropertyValue(n).trim();

      const bad: string[] = [];
      const check = (label: string, fg: RGBA, bg: RGBA) => {
        const r = ratio(fg, bg);
        if (r < threshold) bad.push(`${label} = ${r.toFixed(2)}:1`);
      };

      for (const theme of ["light", "dark"]) {
        document.documentElement.classList.toggle("dark", theme === "dark");
        const surfaces = surfaceTokens.map(
          (t) => [t, resolve(tok(t))] as [string, RGBA]
        );

        for (const hex of palette) {
          const swatch = resolve(hex);
          const ink = resolve(
            `color-mix(in oklab, ${hex} var(--swatch-ink-mix), var(--foreground))`
          );
          const onTintMuted = resolve(
            `color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))`
          );
          for (const [sName, sRGBA] of surfaces) {
            for (const alpha of alphas) {
              const bg = over([swatch[0], swatch[1], swatch[2], alpha], sRGBA);
              check(`${theme} swatch-ink ${hex} on ${sName}@${alpha.toFixed(2)}`, ink, bg);
              check(
                `${theme} on-tint-muted over ${hex} on ${sName}@${alpha.toFixed(2)}`,
                onTintMuted,
                bg
              );
            }
          }
        }

        // Brand red drawn on its own bg-primary/10 tint (active nav, running pill).
        const primary = resolve(tok("--primary"));
        const onTint = resolve(tok("--primary-ink"));
        for (const [sName, sRGBA] of surfaces) {
          const bg = over([primary[0], primary[1], primary[2], 0.1], sRGBA);
          check(`${theme} primary-ink on ${sName}`, onTint, bg);
        }
      }

      document.documentElement.classList.remove("dark");
      probe.remove();
      return bad;
    },
    {
      palette: PROJECT_COLORS,
      alphas: TINT_ALPHAS,
      surfaceTokens: SURFACES,
      threshold: AA_NORMAL,
    }
  );

  expect(failures, `WCAG AA failures:\n${failures.join("\n")}`).toEqual([]);
});
