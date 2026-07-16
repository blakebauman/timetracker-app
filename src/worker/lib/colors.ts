// Tag swatch palette, mirrored from the frontend PROJECT_COLORS so a newly
// auto-created tag gets a stable, distinct color server-side. Kept here (not in
// shared schemas) because it's presentation, but colocated for the worker.
export const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#64748b", "#78716c",
] as const;

// Deterministic color for a tag name so the same name always gets the same
// swatch (until the user overrides it). Simple string hash → palette index.
export function colorForTagName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
