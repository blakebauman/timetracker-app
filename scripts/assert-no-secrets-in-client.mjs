#!/usr/bin/env node
// Tripwire run by `pnpm check` after the build: nothing that ships to browsers
// may carry a secret or a source map.
//
// Why it exists: @cloudflare/vite-plugin copies the real .dev.vars into the
// worker output directory (apps/web/dist/timetracker_app/.dev.vars) on every
// build. Today that directory is not uploaded — the assets root is dist/client
// and the worker upload rule is *.js — so one config edit (assets.directory,
// a CI artifact of dist/**) is the distance between "fine" and publishing the
// Google OAuth client secret. This fails the build the moment a secret-shaped
// string or a map file appears under the client output.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(root, "apps", "web", "dist", "client");

const SECRET_PATTERNS = [
  /GOCSPX-[A-Za-z0-9_-]{10,}/, // Google OAuth client secret
  /BETTER_AUTH_SECRET\s*=/,
  /\bAUTH_SECRET\s*=/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const TEXT_EXT = new Set([".js", ".mjs", ".css", ".html", ".json", ".txt", ".map", ".svg", ".webmanifest"]);

const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    const rel = path.relative(root, p);
    if (name === ".dev.vars" || name.startsWith(".dev.vars.")) problems.push(`${rel}: dev vars file in client output`);
    if (name.endsWith(".map")) problems.push(`${rel}: source map in client output`);
    if (TEXT_EXT.has(path.extname(name))) {
      const text = readFileSync(p, "utf8");
      for (const re of SECRET_PATTERNS) {
        if (re.test(text)) problems.push(`${rel}: matches ${re}`);
      }
    }
  }
}

try {
  walk(clientDir);
} catch (e) {
  console.error(`assert-no-secrets-in-client: cannot read ${clientDir} — run the build first (${e.message})`);
  process.exit(1);
}

if (problems.length) {
  console.error("assert-no-secrets-in-client: refusing to ship:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`assert-no-secrets-in-client: ${clientDir} is clean`);
