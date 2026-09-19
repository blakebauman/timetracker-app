export const PROJECT_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#f43f5e", // rose
  "#64748b", // slate
  "#78716c", // stone
];

// Human-readable name for each PROJECT_COLORS entry, for accessible labels.
export const PROJECT_COLOR_NAMES: Record<string, string> = {
  "#ef4444": "Red",
  "#f97316": "Orange",
  "#f59e0b": "Amber",
  "#eab308": "Yellow",
  "#84cc16": "Lime",
  "#22c55e": "Green",
  "#10b981": "Emerald",
  "#14b8a6": "Teal",
  "#06b6d4": "Cyan",
  "#0ea5e9": "Sky",
  "#3b82f6": "Blue",
  "#6366f1": "Indigo",
  "#8b5cf6": "Violet",
  "#a855f7": "Purple",
  "#ec4899": "Pink",
  "#f43f5e": "Rose",
  "#64748b": "Slate",
  "#78716c": "Stone",
};

// Same palette as PROJECT_COLORS, reordered so stepping through it yields
// perceptually distinct, alternating warm/cool hues (mirrors the worker's
// DISTINCT_COLORS). Used for auto-assignment so successive projects don't come
// out as near-identical warm tones.
export const DISTINCT_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#14b8a6",
  "#ec4899", "#84cc16", "#6366f1", "#f97316", "#06b6d4", "#a855f7",
  "#f43f5e", "#0ea5e9", "#10b981", "#eab308", "#64748b", "#78716c",
];

// Pick a distinct color for a new project: the first distinct-palette entry not
// already used, falling back to stepping through it by project count.
export function nextProjectColor(usedColors: string[]): string {
  const used = new Set(usedColors);
  return (
    DISTINCT_COLORS.find((c) => !used.has(c)) ??
    DISTINCT_COLORS[usedColors.length % DISTINCT_COLORS.length]
  );
}

export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

export function hexToRgba(hex: string, alpha = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
