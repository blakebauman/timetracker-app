import { useState } from "react";

/**
 * Whether a lazily loaded overlay should be in the tree: false until it is
 * first opened, true from then on. Mounting on first open keeps the overlay's
 * chunk out of the first load; staying mounted afterwards lets it play its
 * close animation instead of vanishing with its Suspense boundary.
 */
export function useMountOnOpen(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  // Adjusting state while rendering (not in an effect), so the overlay mounts
  // in the same render that opens it rather than one frame later.
  if (open && !mounted) setMounted(true);
  return mounted;
}
