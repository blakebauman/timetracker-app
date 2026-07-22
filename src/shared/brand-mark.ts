/**
 * The brand mark: a circled analog clock reading ~10:10.
 *
 * Single source of truth for the mark's geometry and canonical colors —
 * imported by both the in-app <BrandMark> component (react-app/components/
 * brand/BrandMark.tsx) and the asset generator (scripts/generate-icons.mjs,
 * run via node's native TS type-stripping). Change the mark here and re-run
 * `pnpm generate-icons`; never redraw the clock anywhere else.
 */

// Pre-converted sRGB hex of the DESIGN.md oklch tokens, for surfaces that
// can't use oklch()/CSS vars (static icon assets, email, OG image).
export const BRAND_RED = "#dd322e"; // --primary light, oklch(0.588 0.207 27.33)
export const BRAND_RED_DARK = "#f34a42"; // --primary dark, oklch(0.65 0.207 27.33)
export const GROUND_LIGHT = "#fcfbfa"; // --background light, oklch(0.988 0.0015 30)
export const GROUND_DARK = "#111315"; // --background dark, oklch(0.185 0.006 265)
export const MUTED_INK_DARK = "#a1a5ac"; // --muted-foreground dark, oklch(0.72 0.012 265)

/**
 * Inner SVG for the clock glyph (ring + hour/minute hands + center dot),
 * hands at ~10:10 — the classic "watch ad" angle. White strokes; meant to
 * sit on a brand-red ground.
 */
export function clockGlyph(cx: number, cy: number, faceR: number): string {
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

/** Face radius as a fraction of the canvas for the inscribed-circle mark. */
export const MARK_FACE_RATIO = 0.39;
