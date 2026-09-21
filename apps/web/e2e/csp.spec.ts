import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { signUp } from "./auth";

// The document ships `script-src 'self'` (public/_headers), which is only
// possible because the pre-paint bootstrap is an external file. The dev server
// does not apply _headers (and Vite dev injects its own inline preamble), so
// the policy itself is asserted from the file and the bootstrap's behaviour is
// asserted in the browser; the header on production is checked with curl
// after deploy.
const here = fileURLToPath(new URL(".", import.meta.url));

test.describe("content security policy", () => {
  test("the document policy has no unsafe-inline for scripts", () => {
    const headers = readFileSync(resolve(here, "../public/_headers"), "utf8");
    const csp = headers.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"))!;
    expect(csp).toBeTruthy();
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toBe("script-src 'self'");
    for (const directive of ["base-uri 'self'", "object-src 'none'", "form-action 'self'", "frame-ancestors 'none'"]) {
      expect(csp).toContain(directive);
    }

    // And index.html carries no inline script that the policy would block.
    const html = readFileSync(resolve(here, "../index.html"), "utf8");
    const inline = html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) ?? [];
    expect(inline).toEqual([]);
    expect(html).toContain('<script src="/boot.js"></script>');
  });

  test("the external bootstrap still resolves the theme before the app mounts", async ({ page }) => {
    await signUp(page);
    const boot = await page.request.get("/boot.js");
    expect(boot.status()).toBe(200);
    expect(await boot.text()).toContain('localStorage.getItem("theme")');

    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload();
    // Read as early as the harness allows: the class is set by boot.js, which
    // runs before the bundle; next-themes would only agree later.
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");

    await page.evaluate(() => localStorage.setItem("theme", "light"));
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });
});
