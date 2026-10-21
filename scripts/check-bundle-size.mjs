#!/usr/bin/env node
// First-load budget for the web app: gzips everything `dist/client/index.html`
// asks for before anything is clicked — the entry script, every modulepreload
// and the stylesheet — and fails when the total passes the budget.
//
//   node scripts/check-bundle-size.mjs            # report + enforce
//   node scripts/check-bundle-size.mjs --report   # report only
//
// The budget is the post-diet first load plus a little headroom. Raise it on
// purpose, in the PR that needs to, never to make CI green.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUDGET_KB = 310;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "apps/web/dist/client");
const html = readFileSync(path.join(client, "index.html"), "utf8");

const assets = new Set();
for (const m of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) assets.add(m[1]);
for (const m of html.matchAll(/<link[^>]+rel="(?:modulepreload|stylesheet)"[^>]+href="([^"]+)"/g)) assets.add(m[1]);

const rows = [...assets]
  .filter((href) => href.startsWith("/assets/"))
  .map((href) => {
    const buf = readFileSync(path.join(client, href));
    return { file: path.basename(href), raw: buf.length, gz: gzipSync(buf, { level: 9 }).length };
  })
  .sort((a, b) => b.gz - a.gz);

const kb = (n) => (n / 1024).toFixed(1);
const total = rows.reduce((t, r) => ({ raw: t.raw + r.raw, gz: t.gz + r.gz }), { raw: 0, gz: 0 });
for (const r of rows.slice(0, 12)) console.log(`${kb(r.gz).padStart(7)} kB gz  ${kb(r.raw).padStart(7)} kB  ${r.file}`);
if (rows.length > 12) console.log(`   … ${rows.length - 12} more`);
console.log(`\nFirst load: ${rows.length} files, ${kb(total.gz)} kB gz (${kb(total.raw)} kB raw); budget ${BUDGET_KB} kB gz`);

if (!process.argv.includes("--report") && total.gz / 1024 > BUDGET_KB) {
  console.error(`\n✖ First load is over budget by ${kb(total.gz - BUDGET_KB * 1024)} kB gz.`);
  process.exit(1);
}
