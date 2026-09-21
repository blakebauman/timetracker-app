#!/usr/bin/env node
// Off-platform backup of the production D1 database.
//
//   pnpm backup:d1            # export → backups/time-tracker-<timestamp>.sql.gz
//   pnpm backup:d1 --keep 12  # prune to the newest N (default 8)
//   pnpm backup:d1 --no-prune
//   pnpm backup:d1 --local    # export the LOCAL dev database instead (smoke test / drill)
//
// D1 Time Travel keeps 30 days of point-in-time history on the paid plan, but
// it is not an off-platform copy, it can't outlive the database, and it won't
// save you from a mistake noticed on day 31. This is the other half: a plain
// SQL export you hold yourself. Run it before every remote migration (see the
// deploy sequence in CLAUDE.md) and on a weekly cadence. docs/RUNBOOK.md has
// the restore drill.
//
// Deliberately a local script rather than a scheduled GitHub Action: the repo
// is public and deploys are manual, so no Cloudflare token lives in GitHub —
// adding one for backups would create a standing credential where there is
// none today. The export is PLAINTEXT and contains every user's entries; keep
// backups/ (gitignored) on an encrypted disk and out of synced folders.

import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps", "web");
const backupsDir = path.join(root, "backups");
const DATABASE = "time-tracker";

const args = process.argv.slice(2);
const keepIdx = args.indexOf("--keep");
const KEEP = keepIdx >= 0 ? Number(args[keepIdx + 1]) : 8;
const PRUNE = !args.includes("--no-prune");
const LOCAL = args.includes("--local");
const target = LOCAL ? "--local" : "--remote";

mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
const sqlPath = path.join(backupsDir, `${DATABASE}${LOCAL ? "-local" : ""}-${stamp}.sql`);
const gzPath = `${sqlPath}.gz`;

console.log(`Exporting ${DATABASE} (${LOCAL ? "local" : "remote"}) → ${path.relative(root, sqlPath)}`);
execFileSync("npx", ["wrangler", "d1", "export", DATABASE, target, "--output", sqlPath], {
  cwd: webDir,
  stdio: "inherit",
});

// Row counts for the two tables that tell you the export is real, read off the
// dump before it is compressed (D1 writes one INSERT per row).
const sql = await readFile(sqlPath, "utf8");
const count = (table) => (sql.match(new RegExp(`^INSERT INTO "?${table}"? `, "gm")) ?? []).length;
const summary = { time_entries: count("time_entries"), users: count("user"), workspaces: count("workspaces") };

await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), createWriteStream(gzPath));
unlinkSync(sqlPath);

const size = statSync(gzPath).size;
console.log(`Wrote ${path.relative(root, gzPath)} (${(size / 1024).toFixed(0)} KiB)`);
console.log(`Rows: ${summary.time_entries} time entries, ${summary.users} users, ${summary.workspaces} workspaces`);
if (summary.time_entries === 0 || summary.users === 0) {
  console.error("Backup looks empty — check the wrangler login/account before trusting it.");
  process.exitCode = 1;
}

if (PRUNE) {
  const files = readdirSync(backupsDir)
    .filter((f) => f.startsWith(`${DATABASE}${LOCAL ? "-local" : ""}-`) && !(!LOCAL && f.startsWith(`${DATABASE}-local-`)) && f.endsWith(".sql.gz"))
    .sort()
    .reverse();
  for (const old of files.slice(KEEP)) {
    unlinkSync(path.join(backupsDir, old));
    console.log(`Pruned ${old}`);
  }
}
