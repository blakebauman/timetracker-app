/**
 * Run `fn` over `items` with at most `limit` in flight, in chunks.
 *
 * The cron sweeps use this instead of a serial `for…await` (one slow provider
 * response head-of-line-blocks every workspace behind it) or an unbounded
 * `Promise.all` (which breaches the Worker's 6-simultaneous-connection limit).
 * `fn` is expected to catch its own per-item errors; a rejection here aborts
 * the remaining chunks, which is the right behaviour for a bug and the wrong
 * one for a bad row — so callers wrap the row-level work in try/catch.
 */
export async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.all(items.slice(i, i + limit).map(fn));
  }
}

/** The concurrency every cron sweep uses; see forEachLimited. */
export const SWEEP_CONCURRENCY = 5;
