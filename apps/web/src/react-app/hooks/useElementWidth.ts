import { useCallback, useLayoutEffect, useState } from "react";

/**
 * Track an element's content-box width via ResizeObserver.
 *
 * Takes a **callback ref** rather than a ref object on purpose: the measured
 * element here mounts and unmounts as the user switches views, and a ref object's
 * identity never changes, so an effect keyed on it would run once — against
 * whatever was (or wasn't) mounted at the time — and never again. The callback
 * ref re-runs the observer setup every time the node itself changes.
 *
 * Returns 0 until the first measurement lands, so callers can distinguish
 * "not measured yet" from "genuinely zero-width" and fall back rather than
 * choosing a layout from a width of nothing.
 */
export function useElementWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  const ref = useCallback((el: T | null) => setNode(el), []);

  useLayoutEffect(() => {
    if (!node) return;

    // No synchronous measurement here: ResizeObserver delivers an initial
    // observation as soon as observe() is called, so a direct setState in the
    // effect body would be both redundant and an extra render.
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // Ignore transient zeroes (hidden tab, unmounting pane) so a background
      // view doesn't collapse itself to the narrowest layout.
      if (w > 0) setWidth(w);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return { ref, width };
}
