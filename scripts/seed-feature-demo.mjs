/**
 * Seed the LOCAL dev workspace with data that actually exercises drafting,
 * budget pacing and the email digest.
 *
 * `seeds/dev-seed.sql` gives you a workspace with some history, but its data is
 * too flat to reach the interesting paths: no project has a budget, so pacing
 * reports `no_budget` for everything; nothing is missing from today, so drafting
 * proposes nothing. This fills those gaps — and running it is how two real bugs
 * were found (overlapping draft proposals, and an AI paragraph contradicting the
 * table above it).
 *
 * Usage:  pnpm seed:demo          (with `pnpm dev` already running)
 *         pnpm seed:demo --port 5199
 *
 * LOCAL ONLY, enforced below: it signs in with the dev seed's known credentials,
 * which must never exist anywhere else, and refuses any non-localhost target.
 */

const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "5173";
const BASE = `http://localhost:${port}`;

// Hard guard. This script writes a lot of entries and rewrites project budgets;
// pointing it at a real deployment would corrupt someone's timesheet.
if (!/^http:\/\/localhost:\d+$/.test(BASE)) {
  console.error("Refusing to run against anything but http://localhost:<port>.");
  process.exit(1);
}

const DEMO = { email: "blake.bauman@gmail.com", password: "TestPassApps2026" };
const OFFSET_HEADER = { "Content-Type": "application/json", Origin: BASE };
let cookie = "";

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...OFFSET_HEADER, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** UTC instant for a local wall-clock time `dayDelta` days from today. */
function at(dayDelta, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayDelta);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const isoDate = (dayDelta = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayDelta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const signin = await api("POST", "/api/auth/sign-in/email", DEMO);
if (!signin?.user) {
  console.error("Sign-in failed. Apply the dev seed first:");
  console.error("  npx wrangler d1 execute time-tracker --local --file=seeds/dev-seed.sql");
  process.exit(1);
}
console.log(`signed in as ${signin.user.email}`);

// Clear the recent window so the script is repeatable rather than additive.
const since = new Date(Date.now() - 70 * 86_400_000).toISOString();
const until = new Date(Date.now() + 2 * 86_400_000).toISOString();
const existing = await api("GET", `/api/time_entries?since=${since}&until=${until}`);
const ids = Array.isArray(existing) ? existing.map((e) => e.id) : [];
for (let i = 0; i < ids.length; i += 100) {
  await api("DELETE", "/api/time_entries/bulk", { ids: ids.slice(i, i + 100) });
}
await api("DELETE", `/api/drafts?date=${isoDate(0)}`);
console.log(`cleared ${ids.length} entries in the demo workspace`);

// One project per pacing status, so every branch of the verdict is visible.
const budgets = [
  ["proj001", { estimatedHours: 90, endDate: isoDate(10) }],  // heavy burn -> at_risk
  ["proj002", { estimatedHours: 120, endDate: isoDate(45) }], // comfortable -> on_track
  ["proj003", { estimatedHours: 8, endDate: isoDate(6) }],    // blown -> over_budget
  ["proj004", { estimatedHours: null, endDate: null }],       // none -> no_budget
];
for (const [id, patch] of budgets) await api("PUT", `/api/projects/${id}`, patch);
console.log("budgets set (one project per pacing status)");

const entry = (description, projectId, day, sh, sm, eh, em) =>
  api("POST", "/api/time_entries", {
    description,
    projectId,
    start: at(day, sh, sm),
    stop: at(day, eh, em),
  });

let created = 0;
const weekdayWork = [
  ["Homepage hero rebuild", "proj001", 9, 0, 12, 0],
  ["Design review and revisions", "proj001", 13, 30, 15, 0],
  ["Auth endpoint hardening", "proj002", 15, 30, 17, 30],
];
for (let d = -13; d < 0; d++) {
  const day = new Date();
  day.setDate(day.getDate() + d);
  if (day.getDay() === 0 || day.getDay() === 6) continue; // weekdays only
  for (const [desc, pid, sh, sm, eh, em] of weekdayWork) {
    await entry(desc, pid, d, sh, sm, eh, em);
    created++;
  }
}
for (const d of [-9, -7, -4, -2]) {
  await entry("Campaign asset production", "proj003", d, 10, 0, 13, 0);
  created++;
}

// A habit on this weekday for the last three weeks, at a time that is free
// today — this is what makes the `pattern` draft source fire.
const todayWeekday = new Date().getDay();
for (const weeksBack of [1, 2, 3]) {
  const d = -7 * weeksBack;
  const day = new Date();
  day.setDate(day.getDate() + d);
  if (day.getDay() === todayWeekday) {
    await entry("Weekly planning + inbox", "proj004", d, 14, 0, 14, 30);
    created++;
  }
}

// Today: two entries with a deliberate hole between them -> the `gap` source.
await entry("Homepage hero rebuild", "proj001", 0, 8, 0, 9, 0);
await entry("Client feedback pass", "proj001", 0, 11, 30, 12, 30);
created += 2;

console.log(`created ${created} entries across the last two weeks`);
console.log("");
console.log("Try it:");
console.log("  • Timer → Draft day        (a gap + a weekly habit should be proposed)");
console.log("  • Projects                 (at risk / over budget / on track / no budget)");
console.log("  • Settings → Email digests → Send one now");
