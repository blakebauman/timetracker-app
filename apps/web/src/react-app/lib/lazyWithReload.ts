import { lazy } from "react";
import type { ComponentType } from "react";

// After a deploy, Vite rehashes chunk filenames. A tab still holding the
// previous index.html will request a chunk that no longer exists; the server
// falls through to index.html, so the browser gets HTML where it expected a
// module and throws "Failed to fetch dynamically imported module".
//
// When that happens, force a one-time reload so the browser fetches the fresh
// index.html (with the current chunk names). A sessionStorage flag guards
// against a reload loop if the import genuinely fails for another reason.
const RELOAD_FLAG = "chunk-reload-attempted";

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Success — clear the guard so a future stale-chunk error can reload again.
      window.sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (error) {
      if (isChunkLoadError(error) && !window.sessionStorage.getItem(RELOAD_FLAG)) {
        window.sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
        // Return a never-resolving promise so React keeps the Suspense
        // fallback up until the reload navigates away.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
