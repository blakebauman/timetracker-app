import { clockGlyph, MARK_FACE_RATIO } from "@shared/brand-mark";

// Same geometry the favicon/PWA/extension icons are generated from
// (scripts/generate-icons.mjs), so the tab icon and the in-app brand always
// match. The circle uses the --primary token, so it tracks the theme's red.
const MARK_INNER =
  `<circle cx="16" cy="16" r="16" fill="var(--primary)"/>` +
  clockGlyph(16, 16, 32 * MARK_FACE_RATIO);

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: MARK_INNER }}
    />
  );
}
