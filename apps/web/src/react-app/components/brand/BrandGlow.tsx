/**
 * The soft red halo behind the brand mark on the auth pages and the 404.
 * One blur, one alpha, declared once — it was pasted into four pages.
 * Render it inside a `relative` box alongside the mark.
 */
export function BrandGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
    />
  );
}
