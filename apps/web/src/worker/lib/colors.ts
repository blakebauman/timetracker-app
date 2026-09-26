// Tag/project swatch palette. TAG_COLORS is hue-ordered (used for tag hashing and
// the manual swatch grid). DISTINCT_COLORS is the SAME set reordered so that
// stepping through it yields perceptually distinct, alternating warm/cool hues —
// used for auto-assignment so a handful of projects don't all come out warm-ish.
// Red and rose sit deep in the order, not first: they are within a few degrees
// of the brand red, which is reserved for the running timer — a first project
// born red made its finished segments on the day ribbon indistinguishable from
// the live one. (Mirrored in react-app/lib/colorUtils.ts.)
export const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#64748b", "#78716c",
] as const;

export const DISTINCT_COLORS = [
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#22c55e", // green
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#a855f7", // purple
  "#eab308", // yellow
  "#0ea5e9", // sky
  "#ef4444", // red
  "#10b981", // emerald
  "#f43f5e", // rose
  "#64748b", // slate
  "#78716c", // stone
] as const;

export const PALETTE = new Set<string>(DISTINCT_COLORS);

// Nth distinct auto-assign color, cycling the palette.
export function spreadColor(index: number): string {
  return DISTINCT_COLORS[((index % DISTINCT_COLORS.length) + DISTINCT_COLORS.length) % DISTINCT_COLORS.length];
}

// Deterministic color for a tag name so the same name always gets the same
// swatch (until the user overrides it). Simple string hash → palette index.
export function colorForTagName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
