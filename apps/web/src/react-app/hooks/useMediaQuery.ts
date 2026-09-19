import { useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query from React.
 *
 * Uses `useSyncExternalStore` rather than useState+useEffect so the first render
 * already has the correct value — a one-frame wrong answer here would flash the
 * seven-column week grid on a phone before collapsing it to a day.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    // Server/prerender fallback: assume the roomy layout.
    () => false
  );
}

// Tailwind's md/lg, as media queries. Kept here so the JS breakpoints that gate
// *behaviour* (which calendar view, whether Split exists) can't drift from the
// CSS breakpoints that gate layout.
export const BELOW_MD = "(max-width: 767px)";
export const BELOW_LG = "(max-width: 1023px)";
