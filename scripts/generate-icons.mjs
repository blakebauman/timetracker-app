#!/usr/bin/env node
/**
 * Generates every Time Tracker brand asset: the browser extension's action
 * icons, the web app's favicon/PWA icon set (regular + maskable-safe), the
 * apple-touch-icon, PWA shortcut icons, and the Open Graph share image.
 * Run via `pnpm generate-icons`.
 */

import sharp from "sharp";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const RED = "#e5291a";
const DARK = "#111315";
const LIGHT = "#fdfcfb";
const MUTED = "#9a9a9a";
const FONT_STACK = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

// ── Clock glyph — hands at ~10:10, the classic "watch ad" angle ────────────
function clockGlyph(cx, cy, faceR) {
  const ring = faceR * 0.08;
  const stroke = faceR * 0.19;
  const hour = faceR * 0.48;
  const minute = faceR * 0.7;
  const dot = faceR * 0.115;
  const minX2 = cx;
  const minY2 = cy - minute;
  const hourAngle = -Math.PI / 3;
  const hrX2 = (cx + hour * Math.sin(hourAngle)).toFixed(2);
  const hrY2 = (cy - hour * Math.cos(hourAngle)).toFixed(2);
  return `
    <circle cx="${cx}" cy="${cy}" r="${faceR}" fill="none" stroke="white" stroke-width="${ring}" opacity="0.9"/>
    <line x1="${cx}" y1="${cy}" x2="${minX2}" y2="${minY2}" stroke="white" stroke-width="${stroke}" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${hrX2}" y2="${hrY2}" stroke="white" stroke-width="${stroke}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${dot}" fill="white"/>`;
}

// "any"-purpose mark: the red circle is inscribed in the canvas (corners
// transparent). This is the general-purpose favicon/app-icon look.
function markSVG(size) {
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${c}" cy="${c}" r="${c}" fill="${RED}"/>
  ${clockGlyph(c, c, size * 0.39)}
</svg>`;
}

// "maskable"-purpose mark: the background bleeds to every edge (a full rect,
// not an inscribed circle) so OS icon masks — circle, squircle, rounded
// square — never reveal a transparent/black corner. The glyph stays well
// inside the ~80%-diameter safe zone the maskable spec requires.
function maskableSVG(size) {
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${RED}"/>
  ${clockGlyph(c, c, size * 0.33)}
</svg>`;
}

// Bar-chart glyph for the "Reports" PWA shortcut.
function reportsSVG(size) {
  const c = size / 2;
  const barW = size * 0.11;
  const gap = size * 0.06;
  const baseY = c + size * 0.18;
  const heights = [0.22, 0.34, 0.16].map((f) => size * f);
  const startX = c - (barW * 3 + gap * 2) / 2;
  const bars = heights
    .map((h, i) => {
      const x = (startX + i * (barW + gap)).toFixed(2);
      const y = (baseY - h).toFixed(2);
      return `<rect x="${x}" y="${y}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="${(barW * 0.25).toFixed(2)}" fill="white"/>`;
    })
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${c}" cy="${c}" r="${c}" fill="${RED}"/>
  ${bars}
</svg>`;
}

// Folder glyph (tab + body, two overlapping rounded rects) for the
// "Projects" PWA shortcut.
function projectsSVG(size) {
  const c = size / 2;
  const bodyW = size * 0.52;
  const bodyH = size * 0.38;
  const bx = (c - bodyW / 2).toFixed(2);
  const by = (c - bodyH / 2 + size * 0.03).toFixed(2);
  const tabW = bodyW * 0.45;
  const tabH = size * 0.08;
  const tx = bx;
  const ty = (Number(by) - tabH + size * 0.02).toFixed(2);
  const rx = (size * 0.035).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${c}" cy="${c}" r="${c}" fill="${RED}"/>
  <rect x="${tx}" y="${ty}" width="${tabW.toFixed(2)}" height="${(tabH * 2).toFixed(2)}" rx="${rx}" fill="white"/>
  <rect x="${bx}" y="${by}" width="${bodyW.toFixed(2)}" height="${bodyH.toFixed(2)}" rx="${rx}" fill="white"/>
</svg>`;
}

// Open Graph / Twitter share card.
function ogImageSVG() {
  const W = 1200;
  const H = 630;
  const markSize = 260;
  const markCx = 160 + markSize / 2;
  const markCy = H / 2;
  const textX = 160 + markSize + 80;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${DARK}"/>
  <circle cx="${markCx}" cy="${markCy}" r="${markSize / 2}" fill="${RED}"/>
  ${clockGlyph(markCx, markCy, markSize * 0.39)}
  <text x="${textX}" y="${markCy - 20}" font-family="${FONT_STACK}" font-size="76" font-weight="700" fill="${LIGHT}">Time Tracker</text>
  <text x="${textX}" y="${markCy + 40}" font-family="${FONT_STACK}" font-size="30" fill="${MUTED}">Track your time, manage projects,</text>
  <text x="${textX}" y="${markCy + 80}" font-family="${FONT_STACK}" font-size="30" fill="${MUTED}">and analyze your productivity.</text>
</svg>`;
}

// Packs raw PNG buffers into a multi-image .ico container (the modern
// "PNG-in-ICO" format — a plain ICONDIR/ICONDIRENTRY header around embedded
// PNG data, supported by every current browser and by Windows since Vista).
function pngsToIco(images) {
  const count = images.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = [];
  const buffers = [];
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256px)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color count (0 = no palette)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8); // image data size
    entry.writeUInt32LE(offset, 12); // offset from file start
    entries.push(entry);
    buffers.push(data);
    offset += data.length;
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4);
  return Buffer.concat([header, ...entries, ...buffers]);
}

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

// ── Extension action icons (unchanged mark, same four sizes) ───────────────
for (const size of [16, 32, 48, 128]) {
  const data = await png(markSVG(size), size);
  writeFileSync(path.join(root, "extension", "icons", `icon${size}.png`), data);
  console.log(`✓ extension/icons/icon${size}.png`);
}

// ── Web favicon: SVG (modern browsers) + multi-res .ico (fallback) ─────────
writeFileSync(path.join(root, "public", "logo.svg"), markSVG(32));
console.log("✓ public/logo.svg");

const icoSizes = [16, 32, 48];
const icoImages = [];
for (const size of icoSizes) {
  icoImages.push({ size, data: await png(markSVG(size), size) });
}
writeFileSync(path.join(root, "public", "favicon.ico"), pngsToIco(icoImages));
console.log("✓ public/favicon.ico");

// ── PWA manifest icons — "any" (inscribed circle) + "maskable" (full-bleed) ─
for (const size of [192, 512]) {
  writeFileSync(path.join(root, "public", `logo${size}.png`), await png(markSVG(size), size));
  console.log(`✓ public/logo${size}.png`);
  writeFileSync(path.join(root, "public", `maskable-${size}.png`), await png(maskableSVG(size), size));
  console.log(`✓ public/maskable-${size}.png`);
}

// ── apple-touch-icon: 180×180, full-bleed background — iOS fills any
// transparent area with black (not white), so this must not rely on the
// inscribed-circle "any" mark's transparent corners. ───────────────────────
writeFileSync(path.join(root, "public", "apple-touch-icon.png"), await png(maskableSVG(180), 180));
console.log("✓ public/apple-touch-icon.png");

// ── PWA shortcut icons (Start Timer / Reports / Projects) ──────────────────
const shortcuts = [
  ["shortcut-timer", markSVG(96)],
  ["shortcut-reports", reportsSVG(96)],
  ["shortcut-projects", projectsSVG(96)],
];
for (const [name, svg] of shortcuts) {
  writeFileSync(path.join(root, "public", `${name}.png`), await png(svg, 96));
  console.log(`✓ public/${name}.png`);
}

// ── Open Graph / Twitter share image ────────────────────────────────────────
await sharp(Buffer.from(ogImageSVG())).png().toFile(path.join(root, "public", "og-image.png"));
console.log("✓ public/og-image.png");

console.log("\nAll icons generated.");
