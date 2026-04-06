#!/usr/bin/env node
/**
 * Generates Time Tracker clock icons for the Chrome extension and web app.
 * Uses sharp (available via pnpm deps) to render SVG → PNG.
 */

import { createRequire } from "module";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const sharp = require(
  "/Users/blake/Sites/PlayGround/time-tracker-app/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── Clock icon SVG ────────────────────────────────────────────────────────────
// Red circle + white clock face ring + hour/minute hands + center dot
function makeSVG(size) {
  const cx = size / 2;
  const cy = size / 2;
  const face   = size * 0.39;   // clock face radius
  const ring   = size * 0.03;   // ring stroke width
  const stroke = size * 0.075;  // hand stroke width
  const hour   = face * 0.48;   // hour hand length
  const minute = face * 0.70;   // minute hand length
  const dot    = size * 0.045;  // center dot radius

  // Minute hand → 12 o'clock (straight up)
  const minX2 = cx;
  const minY2 = cy - minute;

  // Hour hand → ~10 o'clock (-60° from 12)
  const hourAngle = -Math.PI / 3;
  const hrX2 = cx + hour * Math.sin(hourAngle);
  const hrY2 = cy - hour * Math.cos(hourAngle);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${cx}" cy="${cy}" r="${cx}" fill="#e5291a"/>
  <circle cx="${cx}" cy="${cy}" r="${face}" fill="none" stroke="white" stroke-width="${ring}" opacity="0.9"/>
  <line x1="${cx}" y1="${cy}" x2="${minX2}" y2="${minY2}" stroke="white" stroke-width="${stroke}" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy}" x2="${hrX2.toFixed(2)}" y2="${hrY2.toFixed(2)}" stroke="white" stroke-width="${stroke}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${dot}" fill="white"/>
</svg>`;
}

// ── Extension icons ───────────────────────────────────────────────────────────
for (const size of [16, 32, 48, 128]) {
  const outPath = path.join(root, "extension", "icons", `icon${size}.png`);
  await sharp(Buffer.from(makeSVG(size))).png().toFile(outPath);
  console.log(`✓ extension/icons/icon${size}.png`);
}

// ── Public web logo SVG (used as favicon) ─────────────────────────────────────
writeFileSync(path.join(root, "public", "logo.svg"), makeSVG(32));
console.log("✓ public/logo.svg");

// ── PWA / OG PNG sizes ────────────────────────────────────────────────────────
for (const size of [192, 512]) {
  const outPath = path.join(root, "public", `logo${size}.png`);
  await sharp(Buffer.from(makeSVG(size))).png().toFile(outPath);
  console.log(`✓ public/logo${size}.png`);
}

console.log("\nAll icons generated.");
